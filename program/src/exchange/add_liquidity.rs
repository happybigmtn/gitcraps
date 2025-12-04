use ore_api::prelude::*;
use solana_program::clock::Clock;
use solana_program::log::sol_log;
use solana_program::program::invoke;
use solana_program::program::invoke_signed;
use solana_program::sysvar::Sysvar;
use steel::*;

/// Adds liquidity to the exchange pool.
/// Deposits SOL and RNG proportionally, receives LP tokens.
///
/// Account layout:
/// 0: provider (signer, payer)
/// 1: exchange_pool (PDA, writable)
/// 2: lp_mint (PDA, writable)
/// 3: sol_vault (PDA, writable)
/// 4: rng_vault (PDA, writable)
/// 5: provider_sol_ata (writable) - provider's wSOL account (or native SOL)
/// 6: provider_rng_ata (writable) - provider's RNG account
/// 7: provider_lp_ata (writable) - provider's LP destination
/// 8: rng_mint - RNG token mint
/// 9: sol_mint - wrapped SOL mint
/// 10: system_program
/// 11: token_program
/// 12: associated_token_program
pub fn process_add_liquidity(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = AddLiquidity::try_from_bytes(data)?;
    let sol_amount = u64::from_le_bytes(args.sol_amount);
    let rng_amount = u64::from_le_bytes(args.rng_amount);
    let min_lp_tokens = u64::from_le_bytes(args.min_lp_tokens);

    sol_log(&format!(
        "AddLiquidity: sol={}, rng={}, min_lp={}",
        sol_amount, rng_amount, min_lp_tokens
    ));

    // Validate amounts.
    if sol_amount == 0 || rng_amount == 0 {
        sol_log("Amounts must be greater than 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Load accounts.
    let [provider_info, exchange_pool_info, lp_mint_info, sol_vault_info, rng_vault_info, provider_sol_ata, provider_rng_ata, provider_lp_ata, rng_mint, sol_mint, system_program, token_program, associated_token_program] =
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
    associated_token_program.is_program(&spl_associated_token_account::ID)?;

    // Pool must exist and be active.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get pool bump for signing.
    let (_, pool_bump) = exchange_pool_pda();

    // Load pool state.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;

    if !exchange_pool.is_active() {
        sol_log("Pool is not active");
        return Err(ProgramError::InvalidAccountData);
    }

    // Calculate optimal amounts based on current reserves.
    let (optimal_sol, optimal_rng) = if exchange_pool.total_lp_supply == 0 {
        // First deposit - use provided amounts directly.
        (sol_amount, rng_amount)
    } else {
        // Calculate proportional amounts.
        // We use the smaller proportion to ensure both fit.
        let sol_ratio = (sol_amount as u128)
            .checked_mul(exchange_pool.rng_reserve as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let rng_ratio = (rng_amount as u128)
            .checked_mul(exchange_pool.sol_reserve as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        if sol_ratio <= rng_ratio {
            // SOL is the limiting factor.
            let optimal_rng = sol_ratio
                .checked_div(exchange_pool.sol_reserve as u128)
                .ok_or(ProgramError::ArithmeticOverflow)? as u64;
            (sol_amount, optimal_rng)
        } else {
            // RNG is the limiting factor.
            let optimal_sol = rng_ratio
                .checked_div(exchange_pool.rng_reserve as u128)
                .ok_or(ProgramError::ArithmeticOverflow)? as u64;
            (optimal_sol, rng_amount)
        }
    };

    sol_log(&format!(
        "Optimal amounts: sol={}, rng={}",
        optimal_sol, optimal_rng
    ));

    // Calculate LP tokens to mint.
    let lp_tokens = if exchange_pool.total_lp_supply == 0 {
        // First deposit: sqrt(sol * rng) - minimum_liquidity
        let product = (optimal_sol as u128)
            .checked_mul(optimal_rng as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        let sqrt_product = integer_sqrt(product);
        sqrt_product
            .checked_sub(exchange_pool.minimum_liquidity as u128)
            .ok_or(ProgramError::ArithmeticOverflow)? as u64
    } else {
        // Proportional to existing supply.
        let sol_lp = (optimal_sol as u128)
            .checked_mul(exchange_pool.total_lp_supply as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(exchange_pool.sol_reserve as u128)
            .ok_or(ProgramError::ArithmeticOverflow)? as u64;
        let rng_lp = (optimal_rng as u128)
            .checked_mul(exchange_pool.total_lp_supply as u128)
            .ok_or(ProgramError::ArithmeticOverflow)?
            .checked_div(exchange_pool.rng_reserve as u128)
            .ok_or(ProgramError::ArithmeticOverflow)? as u64;
        sol_lp.min(rng_lp)
    };

    if lp_tokens == 0 {
        sol_log("LP tokens would be 0");
        return Err(ProgramError::InvalidArgument);
    }

    // Check slippage.
    if lp_tokens < min_lp_tokens {
        sol_log(&format!(
            "Slippage check failed: {} < {}",
            lp_tokens, min_lp_tokens
        ));
        return Err(ProgramError::InvalidArgument);
    }

    // Create provider's LP ATA if needed.
    if provider_lp_ata.data_is_empty() {
        create_associated_token_account(
            provider_info,
            provider_info,
            provider_lp_ata,
            lp_mint_info,
            system_program,
            token_program,
            associated_token_program,
        )?;
        sol_log("Created provider LP ATA");
    }

    // Transfer SOL to vault.
    invoke(
        &solana_program::system_instruction::transfer(
            provider_info.key,
            sol_vault_info.key,
            optimal_sol,
        ),
        &[provider_info.clone(), sol_vault_info.clone()],
    )?;
    // Sync native to update token balance.
    invoke(
        &spl_token::instruction::sync_native(&spl_token::ID, sol_vault_info.key)?,
        &[sol_vault_info.clone()],
    )?;

    // Transfer RNG to vault.
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            provider_rng_ata.key,
            rng_vault_info.key,
            provider_info.key,
            &[],
            optimal_rng,
        )?,
        &[
            provider_rng_ata.clone(),
            rng_vault_info.clone(),
            provider_info.clone(),
            token_program.clone(),
        ],
    )?;

    // Mint LP tokens to provider.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::mint_to(
            &spl_token::ID,
            lp_mint_info.key,
            provider_lp_ata.key,
            exchange_pool_info.key,
            &[],
            lp_tokens,
        )?,
        &[
            lp_mint_info.clone(),
            provider_lp_ata.clone(),
            exchange_pool_info.clone(),
        ],
        &[pool_seeds],
    )?;

    // Update pool state.
    // Reload pool after transfers (data may have changed).
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.sol_reserve = exchange_pool
        .sol_reserve
        .checked_add(optimal_sol)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.rng_reserve = exchange_pool
        .rng_reserve
        .checked_add(optimal_rng)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.total_lp_supply = exchange_pool
        .total_lp_supply
        .checked_add(lp_tokens)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Update k.
    let new_k = (exchange_pool.sol_reserve as u128)
        .checked_mul(exchange_pool.rng_reserve as u128)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    exchange_pool.set_k(new_k);

    sol_log(&format!(
        "Liquidity added: sol={}, rng={}, lp_minted={}, new_k={}",
        optimal_sol, optimal_rng, lp_tokens, new_k
    ));

    Ok(())
}

/// Integer square root using Newton's method.
fn integer_sqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}
