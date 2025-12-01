use ore_api::prelude::*;
use ore_api::state::Round;
use solana_program::log::sol_log;
use steel::*;

/// Expected size of the Round struct (with discriminator).
const ROUND_SIZE: usize = 8 + std::mem::size_of::<Round>();

/// Migrate a Round account to the new struct size.
/// This reallocates the account to add the new dice_results, dice_sum, and padding fields.
pub fn process_migrate_round(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse args
    let args = MigrateRound::try_from_bytes(data)?;
    let round_id = u64::from_le_bytes(args.round_id);

    // Load accounts
    let [signer_info, config_info, round_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    config_info.has_seeds(&[CONFIG], &ore_api::ID)?;

    let config = config_info.as_account::<Config>(&ore_api::ID)?;

    // Only admin can migrate
    if config.admin != *signer_info.key {
        sol_log("Error: Only admin can migrate accounts");
        return Err(ProgramError::InvalidAccountData);
    }

    // Verify round PDA
    round_info
        .is_writable()?
        .has_seeds(&[ROUND, &round_id.to_le_bytes()], &ore_api::ID)?;

    system_program.is_program(&system_program::ID)?;

    let current_size = round_info.data_len();
    sol_log(&format!(
        "Current round {} size: {}, expected: {}",
        round_id, current_size, ROUND_SIZE
    ));

    // Check if migration is needed
    if current_size >= ROUND_SIZE {
        sol_log("Round account already at correct size, no migration needed");
        return Ok(());
    }

    // Calculate additional rent needed
    let rent = solana_program::rent::Rent::get()?;
    let current_rent = rent.minimum_balance(current_size);
    let new_rent = rent.minimum_balance(ROUND_SIZE);
    let additional_rent = new_rent.saturating_sub(current_rent);

    sol_log(&format!(
        "Reallocation: {} -> {} bytes, additional rent: {} lamports",
        current_size, ROUND_SIZE, additional_rent
    ));

    // Transfer additional rent if needed
    if additional_rent > 0 {
        solana_program::program::invoke(
            &solana_program::system_instruction::transfer(
                signer_info.key,
                round_info.key,
                additional_rent,
            ),
            &[signer_info.clone(), round_info.clone(), system_program.clone()],
        )?;
    }

    // Reallocate the account
    round_info.realloc(ROUND_SIZE, false)?;

    // The new bytes (dice_results, dice_sum, _padding) are already zero-initialized by realloc
    sol_log(&format!(
        "Successfully migrated round {} to {} bytes",
        round_id, ROUND_SIZE
    ));

    Ok(())
}
