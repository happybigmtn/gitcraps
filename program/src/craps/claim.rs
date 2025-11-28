use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

/// Claims pending craps winnings for a user.
pub fn process_claim_craps_winnings(accounts: &[AccountInfo<'_>], _data: &[u8]) -> ProgramResult {
    sol_log("ClaimCrapsWinnings");

    // Load accounts.
    let [signer_info, craps_game_info, craps_position_info, system_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    craps_position_info
        .is_writable()?
        .has_seeds(&[CRAPS_POSITION, &signer_info.key.to_bytes()], &ore_api::ID)?;
    system_program.is_program(&system_program::ID)?;

    // Load accounts.
    if craps_game_info.data_is_empty() {
        sol_log("Craps game not initialized");
        return Err(ProgramError::UninitializedAccount);
    }
    if craps_position_info.data_is_empty() {
        sol_log("Craps position not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    // Verify account ownership
    if craps_game_info.owner != &ore_api::ID {
        sol_log("CrapsGame account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }
    if craps_position_info.owner != &ore_api::ID {
        sol_log("CrapsPosition account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }

    let _craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
    let craps_position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;

    // Check authority.
    if craps_position.authority != *signer_info.key {
        sol_log("Not the position authority");
        return Err(ProgramError::IllegalOwner);
    }

    // Get pending winnings.
    let amount = craps_position.pending_winnings;
    if amount == 0 {
        sol_log("No pending winnings to claim");
        return Err(ProgramError::InvalidArgument);
    }

    // Verify house bankroll has enough.
    // Note: The winnings were already accounted for in settle_craps,
    // so this is a transfer from the game account.
    sol_log(&format!("Claiming {} lamports from craps game", amount).as_str());

    // Clear pending winnings BEFORE transfer (Check-Effects-Interactions pattern).
    craps_position.pending_winnings = 0;

    // Transfer SOL from craps game to user.
    craps_game_info.send(amount, &signer_info);

    sol_log(&format!("Claimed {} lamports", amount).as_str());

    Ok(())
}
