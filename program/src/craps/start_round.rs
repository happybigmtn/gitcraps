use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Admin-only instruction to manually start a round.
/// This bypasses the entropy requirement for devnet testing.
pub fn process_start_round(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse args
    let args = StartRound::try_from_bytes(data)?;
    let duration = u64::from_le_bytes(args.duration);

    // Load accounts
    let [signer_info, board_info, config_info, round_info] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    board_info
        .is_writable()?
        .has_seeds(&[BOARD], &ore_api::ID)?;
    config_info.has_seeds(&[CONFIG], &ore_api::ID)?;

    let config = config_info.as_account::<Config>(&ore_api::ID)?;

    // Only admin can start rounds manually
    if config.admin != *signer_info.key {
        sol_log("Error: Only admin can start rounds");
        return Err(ProgramError::InvalidAccountData);
    }

    let board = board_info.as_account_mut::<Board>(&ore_api::ID)?;
    let round_id = board.round_id;

    // Verify round account
    round_info
        .is_writable()?
        .has_seeds(&[ROUND, &round_id.to_le_bytes()], &ore_api::ID)?;

    let round = round_info.as_account_mut::<Round>(&ore_api::ID)?;

    // Get current slot
    let clock = Clock::get()?;
    let current_slot = clock.slot;

    // Set the round timing
    board.start_slot = current_slot;
    board.end_slot = current_slot + duration;

    // Update round expiry (150 slots after end for claims)
    round.expires_at = board.end_slot + 150;

    sol_log(&format!(
        "Round {} started: slots {} to {} (duration: {})",
        round_id, board.start_slot, board.end_slot, duration
    ));

    Ok(())
}
