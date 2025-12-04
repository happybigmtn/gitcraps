use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke_signed;
use steel::*;

/// Claims accumulated protocol fees from the exchange pool.
/// Admin-only instruction.
///
/// Account layout:
/// 0: admin (signer) - must match pool admin
/// 1: exchange_pool (PDA, writable)
/// 2: sol_vault (PDA, writable) - source of SOL fees
/// 3: rng_vault (PDA, writable) - source of RNG fees
/// 4: admin_sol_ata (writable) - admin's wSOL destination
/// 5: admin_rng_ata (writable) - admin's RNG destination
/// 6: rng_mint - RNG token mint
/// 7: sol_mint - wrapped SOL mint
/// 8: token_program
pub fn process_claim_protocol_fees(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("ClaimProtocolFees");

    // Load accounts.
    let [admin_info, exchange_pool_info, sol_vault_info, rng_vault_info, admin_sol_ata, admin_rng_ata, rng_mint, sol_mint, token_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    admin_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    sol_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_SOL_VAULT], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    admin_sol_ata.is_writable()?;
    admin_rng_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    sol_mint.has_address(&SOL_MINT)?;
    token_program.is_program(&spl_token::ID)?;

    // Pool must exist.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get bumps for signing.
    let (_, pool_bump) = exchange_pool_pda();
    let (_, sol_vault_bump) = exchange_sol_vault_pda();

    // Load pool state and verify admin.
    let exchange_pool = exchange_pool_info.as_account::<ExchangePool>(&ore_api::ID)?;

    if exchange_pool.admin != *admin_info.key {
        sol_log("Only admin can claim protocol fees");
        return Err(ProgramError::InvalidAccountData);
    }

    let sol_fees = exchange_pool.protocol_fees_sol;
    let rng_fees = exchange_pool.protocol_fees_rng;

    sol_log(&format!(
        "Claiming fees: sol={}, rng={}",
        sol_fees, rng_fees
    ));

    // Transfer SOL fees if any.
    if sol_fees > 0 {
        let sol_vault_seeds = &[EXCHANGE_SOL_VAULT, &[sol_vault_bump]];
        invoke_signed(
            &spl_token::instruction::transfer(
                &spl_token::ID,
                sol_vault_info.key,
                admin_sol_ata.key,
                sol_vault_info.key,
                &[],
                sol_fees,
            )?,
            &[
                sol_vault_info.clone(),
                admin_sol_ata.clone(),
                sol_vault_info.clone(),
                token_program.clone(),
            ],
            &[sol_vault_seeds],
        )?;
        sol_log(&format!("Transferred {} SOL fees to admin", sol_fees));
    }

    // Transfer RNG fees if any.
    if rng_fees > 0 {
        let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
        invoke_signed(
            &spl_token::instruction::transfer(
                &spl_token::ID,
                rng_vault_info.key,
                admin_rng_ata.key,
                exchange_pool_info.key,
                &[],
                rng_fees,
            )?,
            &[
                rng_vault_info.clone(),
                admin_rng_ata.clone(),
                exchange_pool_info.clone(),
                token_program.clone(),
            ],
            &[pool_seeds],
        )?;
        sol_log(&format!("Transferred {} RNG fees to admin", rng_fees));
    }

    // Reset fee counters.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.protocol_fees_sol = 0;
    exchange_pool.protocol_fees_rng = 0;

    sol_log("Protocol fees claimed successfully");

    Ok(())
}
