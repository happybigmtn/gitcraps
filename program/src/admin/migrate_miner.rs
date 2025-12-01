use ore_api::prelude::*;
use ore_api::state::Miner;
use solana_program::log::sol_log;
use steel::*;

/// Expected size of the Miner struct (with discriminator).
const MINER_SIZE: usize = 8 + std::mem::size_of::<Miner>();

/// Migrate a Miner account to the new struct size.
/// This reallocates the account to add the dice_prediction and padding fields.
/// Anyone can call this on their own miner account.
pub fn process_migrate_miner(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    // Load accounts
    let [signer_info, miner_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    miner_info
        .is_writable()?
        .has_seeds(&[MINER, signer_info.key.as_ref()], &ore_api::ID)?;

    system_program.is_program(&system_program::ID)?;

    let current_size = miner_info.data_len();
    sol_log(&format!(
        "Current miner size: {}, expected: {}",
        current_size, MINER_SIZE
    ));

    // Check if migration is needed
    if current_size >= MINER_SIZE {
        sol_log("Miner account already at correct size, no migration needed");
        return Ok(());
    }

    // Calculate additional rent needed
    let rent = solana_program::rent::Rent::get()?;
    let current_rent = rent.minimum_balance(current_size);
    let new_rent = rent.minimum_balance(MINER_SIZE);
    let additional_rent = new_rent.saturating_sub(current_rent);

    sol_log(&format!(
        "Reallocation: {} -> {} bytes, additional rent: {} lamports",
        current_size, MINER_SIZE, additional_rent
    ));

    // Transfer additional rent if needed
    if additional_rent > 0 {
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                signer_info.key,
                miner_info.key,
                additional_rent,
            ),
            &[signer_info.clone(), miner_info.clone(), system_program.clone()],
        )?;
    }

    // Reallocate the account
    miner_info.realloc(MINER_SIZE, false)?;

    // The new bytes (dice_prediction, _padding) are already zero-initialized by realloc
    sol_log(&format!(
        "Successfully migrated miner to {} bytes",
        MINER_SIZE
    ));

    Ok(())
}
