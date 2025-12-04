use ore_api::prelude::*;
use solana_program::clock::Clock;
use solana_program::log::sol_log;
use solana_program::program::invoke;
use solana_program::program::invoke_signed;
use solana_program::sysvar::Sysvar;
use steel::*;

/// Swaps SOL for RNG using CPMM pricing.
///
/// Account layout:
/// 0: user (signer)
/// 1: exchange_pool (PDA, writable)
/// 2: sol_vault (PDA, writable)
/// 3: rng_vault (PDA, writable)
/// 4: user_rng_ata (writable) - user's RNG destination
/// 5: rng_mint - RNG token mint
/// 6: sol_mint - wrapped SOL mint
/// 7: system_program
/// 8: token_program
pub fn process_swap_sol_to_rng(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = SwapSolToRng::try_from_bytes(data)?;
    let sol_amount = u64::from_le_bytes(args.sol_amount);
    let min_rng_out = u64::from_le_bytes(args.min_rng_out);

    sol_log(&format!(
        "SwapSolToRng: sol_in={}, min_rng_out={}",
        sol_amount, min_rng_out
    ));

    // Validate amounts.
    if sol_amount == 0 {
        sol_log("SOL amount must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [user_info, exchange_pool_info, sol_vault_info, rng_vault_info, user_rng_ata, rng_mint, sol_mint, system_program, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    user_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    sol_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_SOL_VAULT], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    user_rng_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    sol_mint.has_address(&SOL_MINT)?;
    system_program.is_program(&system_program::ID)?;
    token_program.is_program(&spl_token::ID)?;

    // Pool must exist and be active.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get bumps for signing.
    let (_, pool_bump) = exchange_pool_pda();

    // Load pool state.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;

    if !exchange_pool.is_active() {
        sol_log("Pool is not active");
        return Err(ProgramError::InvalidAccountData);
    }

    // Check max swap size (prevent large impact swaps).
    let max_swap = exchange_pool
        .sol_reserve
        .checked_mul(EXCHANGE_MAX_SWAP_BPS)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if sol_amount > max_swap {
        sol_log(&format!("Swap too large: {} > max {}", sol_amount, max_swap));
        return Err(ProgramError::InvalidArgument);
    }

    // Calculate output using CPMM formula.
    let (rng_out, lp_fee, protocol_fee) = exchange_pool
        .calculate_swap_output(sol_amount, exchange_pool.sol_reserve, exchange_pool.rng_reserve)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Swap output: rng_out={}, lp_fee={}, protocol_fee={}",
        rng_out, lp_fee, protocol_fee
    ));

    // Check slippage.
    if rng_out < min_rng_out {
        sol_log(&format!(
            "Slippage check failed: {} < {}",
            rng_out, min_rng_out
        ));
        return Err(ProgramError::InvalidArgument);
    }

    // Transfer SOL from user to vault.
    invoke(
        &solana_program::system_instruction::transfer(user_info.key, sol_vault_info.key, sol_amount),
        &[user_info.clone(), sol_vault_info.clone()],
    )?;
    // Sync native to update token balance.
    invoke(
        &spl_token::instruction::sync_native(&spl_token::ID, sol_vault_info.key)?,
        &[sol_vault_info.clone()],
    )?;

    // Transfer RNG from vault to user.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            rng_vault_info.key,
            user_rng_ata.key,
            exchange_pool_info.key,
            &[],
            rng_out,
        )?,
        &[
            rng_vault_info.clone(),
            user_rng_ata.clone(),
            exchange_pool_info.clone(),
            token_program.clone(),
        ],
        &[pool_seeds],
    )?;

    // Update pool state.
    let clock = Clock::get()?;
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;

    // SOL goes in (minus protocol fee which stays tracked separately).
    let sol_in_to_pool = sol_amount
        .checked_sub(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.sol_reserve = exchange_pool
        .sol_reserve
        .checked_add(sol_in_to_pool)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    // RNG goes out.
    exchange_pool.rng_reserve = exchange_pool
        .rng_reserve
        .checked_sub(rng_out)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Track protocol fees (in SOL for this swap direction).
    exchange_pool.protocol_fees_sol = exchange_pool
        .protocol_fees_sol
        .checked_add(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Update k (will change slightly due to fees going to LPs).
    let new_k = (exchange_pool.sol_reserve as u128)
        .checked_mul(exchange_pool.rng_reserve as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.set_k(new_k);

    // Update stats.
    exchange_pool.total_volume_sol = exchange_pool
        .total_volume_sol
        .checked_add(sol_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_fees_collected_sol = exchange_pool
        .total_fees_collected_sol
        .checked_add(lp_fee)
        .checked_and_then(|v| v.checked_add(protocol_fee))
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_swaps = exchange_pool
        .total_swaps
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.last_swap_at = clock.unix_timestamp;

    sol_log(&format!(
        "Swap complete: sol_in={}, rng_out={}, new_k={}",
        sol_amount, rng_out, new_k
    ));

    Ok(())
}

/// Swaps RNG for SOL using CPMM pricing.
///
/// Account layout:
/// 0: user (signer)
/// 1: exchange_pool (PDA, writable)
/// 2: sol_vault (PDA, writable)
/// 3: rng_vault (PDA, writable)
/// 4: user_sol_ata (writable) - user's wSOL destination
/// 5: user_rng_ata (writable) - user's RNG source
/// 6: rng_mint - RNG token mint
/// 7: sol_mint - wrapped SOL mint
/// 8: system_program
/// 9: token_program
pub fn process_swap_rng_to_sol(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = SwapRngToSol::try_from_bytes(data)?;
    let rng_amount = u64::from_le_bytes(args.rng_amount);
    let min_sol_out = u64::from_le_bytes(args.min_sol_out);

    sol_log(&format!(
        "SwapRngToSol: rng_in={}, min_sol_out={}",
        rng_amount, min_sol_out
    ));

    // Validate amounts.
    if rng_amount == 0 {
        sol_log("RNG amount must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [user_info, exchange_pool_info, sol_vault_info, rng_vault_info, user_sol_ata, user_rng_ata, rng_mint, sol_mint, system_program, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    user_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    sol_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_SOL_VAULT], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    user_sol_ata.is_writable()?;
    user_rng_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    sol_mint.has_address(&SOL_MINT)?;
    system_program.is_program(&system_program::ID)?;
    token_program.is_program(&spl_token::ID)?;

    // Pool must exist and be active.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get bumps for signing.
    let (_, pool_bump) = exchange_pool_pda();

    // Load pool state.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;

    if !exchange_pool.is_active() {
        sol_log("Pool is not active");
        return Err(ProgramError::InvalidAccountData);
    }

    // Check max swap size (prevent large impact swaps).
    let max_swap = exchange_pool
        .rng_reserve
        .checked_mul(EXCHANGE_MAX_SWAP_BPS)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(10000)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if rng_amount > max_swap {
        sol_log(&format!("Swap too large: {} > max {}", rng_amount, max_swap));
        return Err(ProgramError::InvalidArgument);
    }

    // Calculate output using CPMM formula.
    let (sol_out, lp_fee, protocol_fee) = exchange_pool
        .calculate_swap_output(rng_amount, exchange_pool.rng_reserve, exchange_pool.sol_reserve)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!(
        "Swap output: sol_out={}, lp_fee={}, protocol_fee={}",
        sol_out, lp_fee, protocol_fee
    ));

    // Check slippage.
    if sol_out < min_sol_out {
        sol_log(&format!(
            "Slippage check failed: {} < {}",
            sol_out, min_sol_out
        ));
        return Err(ProgramError::InvalidArgument);
    }

    // Transfer RNG from user to vault.
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            user_rng_ata.key,
            rng_vault_info.key,
            user_info.key,
            &[],
            rng_amount,
        )?,
        &[
            user_rng_ata.clone(),
            rng_vault_info.clone(),
            user_info.clone(),
            token_program.clone(),
        ],
    )?;

    // Transfer SOL from vault to user (as wSOL).
    // Note: The pool PDA is the owner/authority of both vaults.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            sol_vault_info.key,
            user_sol_ata.key,
            exchange_pool_info.key, // Pool is the authority
            &[],
            sol_out,
        )?,
        &[
            sol_vault_info.clone(),
            user_sol_ata.clone(),
            exchange_pool_info.clone(),
            token_program.clone(),
        ],
        &[pool_seeds],
    )?;

    // Update pool state.
    let clock = Clock::get()?;
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;

    // RNG goes in (minus protocol fee which stays tracked separately).
    let rng_in_to_pool = rng_amount
        .checked_sub(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.rng_reserve = exchange_pool
        .rng_reserve
        .checked_add(rng_in_to_pool)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    // SOL goes out.
    exchange_pool.sol_reserve = exchange_pool
        .sol_reserve
        .checked_sub(sol_out)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Track protocol fees (in RNG for this swap direction).
    exchange_pool.protocol_fees_rng = exchange_pool
        .protocol_fees_rng
        .checked_add(protocol_fee)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Update k.
    let new_k = (exchange_pool.sol_reserve as u128)
        .checked_mul(exchange_pool.rng_reserve as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.set_k(new_k);

    // Update stats (convert to SOL equivalent for volume tracking).
    let sol_equivalent = sol_out; // Use output SOL as volume metric.
    exchange_pool.total_volume_sol = exchange_pool
        .total_volume_sol
        .checked_add(sol_equivalent)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_swaps = exchange_pool
        .total_swaps
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.last_swap_at = clock.unix_timestamp;

    sol_log(&format!(
        "Swap complete: rng_in={}, sol_out={}, new_k={}",
        rng_amount, sol_out, new_k
    ));

    Ok(())
}

/// Helper trait for checked arithmetic chains.
trait CheckedAnd {
    fn checked_and_then<F>(self, f: F) -> Option<u64>
    where
        F: FnOnce(u64) -> Option<u64>;
}

impl CheckedAnd for Option<u64> {
    fn checked_and_then<F>(self, f: F) -> Option<u64>
    where
        F: FnOnce(u64) -> Option<u64>,
    {
        self.and_then(f)
    }
}
