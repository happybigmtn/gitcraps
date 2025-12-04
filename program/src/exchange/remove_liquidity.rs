use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke_signed;
use steel::*;

/// Removes liquidity from the exchange pool.
/// Burns LP tokens, receives proportional SOL and RNG.
///
/// Account layout:
/// 0: provider (signer)
/// 1: exchange_pool (PDA, writable)
/// 2: lp_mint (PDA, writable)
/// 3: sol_vault (PDA, writable)
/// 4: rng_vault (PDA, writable)
/// 5: provider_sol_ata (writable) - provider's wSOL destination
/// 6: provider_rng_ata (writable) - provider's RNG destination
/// 7: provider_lp_ata (writable) - provider's LP source
/// 8: rng_mint - RNG token mint
/// 9: sol_mint - wrapped SOL mint
/// 10: system_program
/// 11: token_program
pub fn process_remove_liquidity(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = RemoveLiquidity::try_from_bytes(data)?;
    let lp_amount = u64::from_le_bytes(args.lp_amount);
    let min_sol = u64::from_le_bytes(args.min_sol);
    let min_rng = u64::from_le_bytes(args.min_rng);

    sol_log(&format!(
        "RemoveLiquidity: lp={}, min_sol={}, min_rng={}",
        lp_amount, min_sol, min_rng
    ));

    // Validate amounts.
    if lp_amount == 0 {
        sol_log("LP amount must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [provider_info, exchange_pool_info, lp_mint_info, sol_vault_info, rng_vault_info, provider_sol_ata, provider_rng_ata, provider_lp_ata, rng_mint, sol_mint, system_program, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    provider_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    lp_mint_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_LP_MINT], &ore_api::ID)?;
    sol_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_SOL_VAULT], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    provider_sol_ata.is_writable()?;
    provider_rng_ata.is_writable()?;
    provider_lp_ata.is_writable()?;
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
    let (_, sol_vault_bump) = exchange_sol_vault_pda();
    let (_, _rng_vault_bump) = exchange_rng_vault_pda();

    // Load pool state.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;

    if !exchange_pool.is_active() {
        sol_log("Pool is not active");
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate withdrawal amounts.
    let sol_amount = (lp_amount as u128)
        .checked_mul(exchange_pool.sol_reserve as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(exchange_pool.total_lp_supply as u128)
        .ok_or(ProgramError::ArithmeticOverflow)? as u64;

    let rng_amount = (lp_amount as u128)
        .checked_mul(exchange_pool.rng_reserve as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?
        .checked_div(exchange_pool.total_lp_supply as u128)
        .ok_or(ProgramError::ArithmeticOverflow)? as u64;

    sol_log(&format!(
        "Withdrawal amounts: sol={}, rng={}",
        sol_amount, rng_amount
    ));

    // Check slippage.
    if sol_amount < min_sol {
        sol_log(&format!(
            "SOL slippage check failed: {} < {}",
            sol_amount, min_sol
        ));
        return Err(ProgramError::InvalidArgument);
    }
    if rng_amount < min_rng {
        sol_log(&format!(
            "RNG slippage check failed: {} < {}",
            rng_amount, min_rng
        ));
        return Err(ProgramError::InvalidArgument);
    }

    // Ensure pool keeps minimum liquidity.
    let remaining_lp = exchange_pool
        .total_lp_supply
        .checked_sub(lp_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    if remaining_lp < exchange_pool.minimum_liquidity {
        sol_log("Cannot remove liquidity below minimum");
        return Err(ProgramError::InvalidArgument);
    }

    // Burn LP tokens from provider.
    invoke_signed(
        &spl_token::instruction::burn(
            &spl_token::ID,
            provider_lp_ata.key,
            lp_mint_info.key,
            provider_info.key,
            &[],
            lp_amount,
        )?,
        &[
            provider_lp_ata.clone(),
            lp_mint_info.clone(),
            provider_info.clone(),
        ],
        &[],
    )?;

    // Transfer SOL from vault to provider.
    let sol_vault_seeds = &[EXCHANGE_SOL_VAULT, &[sol_vault_bump]];
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            sol_vault_info.key,
            provider_sol_ata.key,
            sol_vault_info.key,
            &[],
            sol_amount,
        )?,
        &[
            sol_vault_info.clone(),
            provider_sol_ata.clone(),
            sol_vault_info.clone(),
            token_program.clone(),
        ],
        &[sol_vault_seeds],
    )?;

    // Transfer RNG from vault to provider.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            rng_vault_info.key,
            provider_rng_ata.key,
            exchange_pool_info.key,
            &[],
            rng_amount,
        )?,
        &[
            rng_vault_info.clone(),
            provider_rng_ata.clone(),
            exchange_pool_info.clone(),
            token_program.clone(),
        ],
        &[pool_seeds],
    )?;

    // Update pool state.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.sol_reserve = exchange_pool
        .sol_reserve
        .checked_sub(sol_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.rng_reserve = exchange_pool
        .rng_reserve
        .checked_sub(rng_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_lp_supply = exchange_pool
        .total_lp_supply
        .checked_sub(lp_amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Update k.
    let new_k = (exchange_pool.sol_reserve as u128)
        .checked_mul(exchange_pool.rng_reserve as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.set_k(new_k);

    sol_log(&format!(
        "Liquidity removed: sol={}, rng={}, lp_burned={}, new_k={}",
        sol_amount, rng_amount, lp_amount, new_k
    ));

    Ok(())
}
