use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke_signed;
use steel::*;

/// Distributes exchange protocol fees to stakers.
///
/// Takes 50% of accumulated protocol fees (RNG) and distributes to stakers
/// via the Treasury's rng_rewards_factor. The other 50% remains for admin.
///
/// Account layout:
/// 0: caller (signer) - anyone can trigger distribution
/// 1: exchange_pool (PDA, writable)
/// 2: rng_vault (PDA, writable) - source of RNG fees
/// 3: treasury (PDA, writable) - receives RNG for staker distribution
/// 4: treasury_rng_ata (writable) - treasury's RNG token account
/// 5: rng_mint - RNG token mint
/// 6: token_program
/// 7: associated_token_program
/// 8: system_program
pub fn process_distribute_exchange_fees(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("DistributeExchangeFees");

    // Load accounts.
    let [caller_info, exchange_pool_info, rng_vault_info, treasury_info, treasury_rng_ata, rng_mint, token_program, associated_token_program, system_program] =
        accounts
    else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    // Validate accounts.
    caller_info.is_signer()?;
    exchange_pool_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_POOL], &ore_api::ID)?;
    rng_vault_info
        .is_writable()?
        .has_seeds(&[EXCHANGE_RNG_VAULT], &ore_api::ID)?;
    treasury_info
        .is_writable()?
        .has_seeds(&[TREASURY], &ore_api::ID)?;
    treasury_rng_ata.is_writable()?;
    rng_mint.has_address(&RNG_MINT_ADDRESS)?;
    token_program.is_program(&spl_token::ID)?;
    associated_token_program.is_program(&spl_associated_token_account::ID)?;
    system_program.is_program(&system_program::ID)?;

    // Pool must exist.
    if exchange_pool_info.data_is_empty() {
        sol_log("Pool not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Treasury must exist.
    if treasury_info.data_is_empty() {
        sol_log("Treasury not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Get bumps for signing.
    let (_, pool_bump) = exchange_pool_pda();

    // Load pool state.
    let exchange_pool = exchange_pool_info.as_account::<ExchangePool>(&ore_api::ID)?;
    let rng_fees = exchange_pool.protocol_fees_rng;

    if rng_fees == 0 {
        sol_log("No RNG fees to distribute");
        return Ok(());
    }

    // 50% goes to stakers, 50% remains for admin
    let staker_share = rng_fees / 2;

    if staker_share == 0 {
        sol_log("Staker share too small");
        return Ok(());
    }

    sol_log(&format!(
        "Distributing {} RNG to stakers (of {} total fees)",
        staker_share, rng_fees
    ));

    // Create treasury RNG ATA if it doesn't exist.
    if treasury_rng_ata.data_is_empty() {
        sol_log("Creating treasury RNG ATA");
        create_associated_token_account(
            caller_info,
            treasury_info,
            treasury_rng_ata,
            rng_mint,
            system_program,
            token_program,
            associated_token_program,
        )?;
    } else {
        treasury_rng_ata.as_associated_token_account(treasury_info.key, rng_mint.key)?;
    }

    // Transfer staker share from RNG vault to treasury.
    let pool_seeds = &[EXCHANGE_POOL, &[pool_bump]];
    invoke_signed(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            rng_vault_info.key,
            treasury_rng_ata.key,
            exchange_pool_info.key,
            &[],
            staker_share,
        )?,
        &[
            rng_vault_info.clone(),
            treasury_rng_ata.clone(),
            exchange_pool_info.clone(),
            token_program.clone(),
        ],
        &[pool_seeds],
    )?;

    // Load treasury and update rewards factor.
    let treasury = treasury_info.as_account_mut::<Treasury>(&ore_api::ID)?;

    // Calculate rewards per staked token and update factor.
    // Formula: rng_rewards_factor += staker_share / total_staked
    if treasury.total_staked > 0 {
        let rewards_per_token = Numeric::from_fraction(staker_share, treasury.total_staked);
        treasury.rng_rewards_factor = treasury.rng_rewards_factor + rewards_per_token;
        treasury.total_rng_distributed += staker_share;
        treasury.rng_rewards_pool += staker_share;

        sol_log(&format!(
            "Updated rng_rewards_factor, total_staked={}",
            treasury.total_staked
        ));
    } else {
        // No stakers - add to pool for future distribution
        treasury.rng_rewards_pool += staker_share;
        sol_log("No stakers - added to pool for future");
    }

    // Update pool state - deduct only the staker share from protocol fees.
    let exchange_pool = exchange_pool_info.as_account_mut::<ExchangePool>(&ore_api::ID)?;
    exchange_pool.protocol_fees_rng -= staker_share;

    sol_log(&format!(
        "Distributed {} RNG to stakers, {} remaining for admin",
        staker_share, exchange_pool.protocol_fees_rng
    ));

    Ok(())
}
