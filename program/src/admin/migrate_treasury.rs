use ore_api::prelude::*;
use ore_api::state::Treasury;
use solana_program::log::sol_log;
use steel::*;

/// Expected size of the Treasury struct (with discriminator).
const TREASURY_SIZE: usize = 8 + std::mem::size_of::<Treasury>();

/// Migrate the Treasury account to the new struct size.
/// This reallocates the account to add the RNG rewards fields.
/// Admin-only instruction.
pub fn process_migrate_treasury(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("MigrateTreasury");

    // Load accounts
    let [signer_info, treasury_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    treasury_info
        .is_writable()?
        .has_seeds(&[TREASURY], &ore_api::ID)?;
    system_program.is_program(&system_program::ID)?;

    let current_size = treasury_info.data_len();
    sol_log(&format!(
        "Current treasury size: {}, expected: {}",
        current_size, TREASURY_SIZE
    ));

    // Check if migration is needed
    if current_size >= TREASURY_SIZE {
        sol_log("Treasury account already at correct size, no migration needed");
        return Ok(());
    }

    // Calculate additional rent needed
    let rent = solana_program::rent::Rent::get()?;
    let current_rent = rent.minimum_balance(current_size);
    let new_rent = rent.minimum_balance(TREASURY_SIZE);
    let additional_rent = new_rent.saturating_sub(current_rent);

    sol_log(&format!(
        "Reallocation: {} -> {} bytes, additional rent: {} lamports",
        current_size, TREASURY_SIZE, additional_rent
    ));

    // Transfer additional rent if needed
    if additional_rent > 0 {
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                signer_info.key,
                treasury_info.key,
                additional_rent,
            ),
            &[
                signer_info.clone(),
                treasury_info.clone(),
                system_program.clone(),
            ],
        )?;
    }

    // Reallocate the account
    treasury_info.realloc(TREASURY_SIZE, false)?;

    // The new bytes are already zero-initialized by realloc:
    // - rng_rewards_factor: Numeric (16 bytes) = 0
    // - total_rng_distributed: u64 (8 bytes) = 0
    // - rng_rewards_pool: u64 (8 bytes) = 0
    sol_log(&format!(
        "Successfully migrated treasury to {} bytes",
        TREASURY_SIZE
    ));

    Ok(())
}
