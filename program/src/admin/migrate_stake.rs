use ore_api::prelude::*;
use ore_api::state::Stake;
use solana_program::log::sol_log;
use steel::*;

/// Expected size of the Stake struct (with discriminator).
const STAKE_SIZE: usize = 8 + std::mem::size_of::<Stake>();

/// Migrate a Stake account to the new struct size.
/// This reallocates the account to add the RNG rewards fields.
/// Anyone can call this on their own stake account.
pub fn process_migrate_stake(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("MigrateStake");

    // Load accounts
    let [signer_info, stake_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    stake_info
        .is_writable()?
        .has_seeds(&[STAKE, signer_info.key.as_ref()], &ore_api::ID)?;
    system_program.is_program(&system_program::ID)?;

    let current_size = stake_info.data_len();
    sol_log(&format!(
        "Current stake size: {}, expected: {}",
        current_size, STAKE_SIZE
    ));

    // Check if migration is needed
    if current_size >= STAKE_SIZE {
        sol_log("Stake account already at correct size, no migration needed");
        return Ok(());
    }

    // Calculate additional rent needed
    let rent = solana_program::rent::Rent::get()?;
    let current_rent = rent.minimum_balance(current_size);
    let new_rent = rent.minimum_balance(STAKE_SIZE);
    let additional_rent = new_rent.saturating_sub(current_rent);

    sol_log(&format!(
        "Reallocation: {} -> {} bytes, additional rent: {} lamports",
        current_size, STAKE_SIZE, additional_rent
    ));

    // Transfer additional rent if needed
    if additional_rent > 0 {
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                signer_info.key,
                stake_info.key,
                additional_rent,
            ),
            &[
                signer_info.clone(),
                stake_info.clone(),
                system_program.clone(),
            ],
        )?;
    }

    // Reallocate the account
    stake_info.realloc(STAKE_SIZE, false)?;

    // The new bytes are already zero-initialized by realloc:
    // - rng_rewards_factor: Numeric (16 bytes) = 0
    // - rng_rewards: u64 (8 bytes) = 0
    // - lifetime_rng_rewards: u64 (8 bytes) = 0
    sol_log(&format!(
        "Successfully migrated stake to {} bytes",
        STAKE_SIZE
    ));

    Ok(())
}
