//! SECURITY FIX 2.1: Force settle instruction
//!
//! This instruction allows anyone to trigger settlement for a craps position
//! that hasn't been settled within the round's expiry window. This prevents
//! the "Reserved Payout DoS" attack where malicious users place bets and
//! never settle, permanently locking up house bankroll.

use ore_api::prelude::*;
use solana_program::clock::Clock;
use solana_program::log::sol_log;
use solana_program::sysvar::Sysvar;
use steel::*;

/// Force settle a craps position after round expiry.
/// This can be called by anyone (permissionless crank) to release reserved payouts.
pub fn process_force_settle_craps(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = ForceSettleCraps::try_from_bytes(data)?;
    let winning_square = u64::from_le_bytes(args.winning_square) as usize;

    sol_log("ForceSettleCraps: permissionless settlement");

    // Load accounts.
    // Account layout:
    // 0: caller (anyone - doesn't need to be position owner)
    // 1: craps_game - game state PDA
    // 2: craps_position - user position PDA (for ANY user)
    // 3: round_info - round account for validation
    let [caller_info, craps_game_info, craps_position_info, round_info] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    caller_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    craps_position_info.is_writable()?;
    // Note: craps_position can be ANY user's position, verified by program owner check

    // Verify accounts are program-owned
    if craps_game_info.owner != &ore_api::ID {
        sol_log("CrapsGame account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }
    if craps_position_info.owner != &ore_api::ID {
        sol_log("CrapsPosition account not owned by program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Load accounts
    if craps_game_info.data_is_empty() || craps_position_info.data_is_empty() {
        sol_log("Accounts not initialized");
        return Err(ProgramError::UninitializedAccount);
    }

    let craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
    let craps_position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;
    let round = round_info.as_account::<Round>(&ore_api::ID)?;

    // Validate that the winning square matches the round's result.
    #[cfg(not(any(feature = "localnet", feature = "devnet")))]
    {
        let Some(rng) = round.rng() else {
            sol_log("Round has no valid RNG");
            return Err(ProgramError::InvalidAccountData);
        };
        let actual_winning_square = round.winning_square(rng);
        if actual_winning_square != winning_square {
            sol_log("Winning square mismatch");
            return Err(ProgramError::InvalidArgument);
        }
    }

    // CRITICAL CHECK: Round must be expired before force settle is allowed
    // This ensures users have had sufficient time to settle their own positions
    let clock = Clock::get()?;
    if clock.slot <= round.expires_at {
        sol_log("ERROR: Round has not expired yet - cannot force settle");
        return Err(ProgramError::Custom(2)); // Error code 2: ROUND_NOT_EXPIRED
    }

    // Check if position has any active bets that need settling
    let has_any_bets = craps_position.pass_line > 0
        || craps_position.dont_pass > 0
        || craps_position.pass_odds > 0
        || craps_position.dont_pass_odds > 0
        || craps_position.field_bet > 0
        || craps_position.any_seven > 0
        || craps_position.any_craps > 0
        || craps_position.yo_eleven > 0
        || craps_position.aces > 0
        || craps_position.twelve > 0
        || craps_position.come_bets.iter().any(|&x| x > 0)
        || craps_position.place_bets.iter().any(|&x| x > 0)
        || craps_position.yes_bets.iter().any(|&x| x > 0)
        || craps_position.no_bets.iter().any(|&x| x > 0)
        || craps_position.next_bets.iter().any(|&x| x > 0)
        || craps_position.hardways.iter().any(|&x| x > 0);

    if !has_any_bets {
        sol_log("No active bets to force settle");
        return Ok(());
    }

    // Calculate total reserved payouts that will be released
    // We simply forfeit all bets and release the reserved amount
    let mut total_forfeited: u64 = 0;

    // Line bets
    total_forfeited = total_forfeited.saturating_add(craps_position.pass_line);
    total_forfeited = total_forfeited.saturating_add(craps_position.dont_pass);
    total_forfeited = total_forfeited.saturating_add(craps_position.pass_odds);
    total_forfeited = total_forfeited.saturating_add(craps_position.dont_pass_odds);

    // Single-roll bets
    total_forfeited = total_forfeited.saturating_add(craps_position.field_bet);
    total_forfeited = total_forfeited.saturating_add(craps_position.any_seven);
    total_forfeited = total_forfeited.saturating_add(craps_position.any_craps);
    total_forfeited = total_forfeited.saturating_add(craps_position.yo_eleven);
    total_forfeited = total_forfeited.saturating_add(craps_position.aces);
    total_forfeited = total_forfeited.saturating_add(craps_position.twelve);

    // Array bets
    for bet in craps_position.come_bets.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.come_odds.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.dont_come_bets.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.dont_come_odds.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.place_bets.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.yes_bets.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.no_bets.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.next_bets.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }
    for bet in craps_position.hardways.iter() {
        total_forfeited = total_forfeited.saturating_add(*bet);
    }

    // Clear all bets (forfeited due to not settling in time)
    craps_position.pass_line = 0;
    craps_position.dont_pass = 0;
    craps_position.pass_odds = 0;
    craps_position.dont_pass_odds = 0;
    craps_position.field_bet = 0;
    craps_position.any_seven = 0;
    craps_position.any_craps = 0;
    craps_position.yo_eleven = 0;
    craps_position.aces = 0;
    craps_position.twelve = 0;
    craps_position.come_bets = [0; 6];
    craps_position.come_odds = [0; 6];
    craps_position.dont_come_bets = [0; 6];
    craps_position.dont_come_odds = [0; 6];
    craps_position.place_bets = [0; 6];
    craps_position.yes_bets = [0; 11];
    craps_position.no_bets = [0; 11];
    craps_position.next_bets = [0; 11];
    craps_position.hardways = [0; 4];

    // Update tracking
    craps_position.total_lost = craps_position.total_lost
        .saturating_add(total_forfeited);
    craps_position.last_updated_round = round.id;

    // Release ALL reserved payouts for this position
    // Since bets are forfeited, the house keeps the tokens and reserved amount is released
    // We use a conservative estimate - release reserved based on forfeited amount
    // (This is a simplification - in reality we'd track exact reserved amounts)
    craps_game.reserved_payouts = craps_game.reserved_payouts.saturating_sub(
        total_forfeited.saturating_mul(2) // Approximate max payout was 2x for most bets
    );

    // House keeps forfeited bets (already in house_bankroll from place_bet)
    craps_game.total_collected = craps_game.total_collected
        .saturating_add(total_forfeited);

    sol_log(&format!(
        "Force settled: forfeited={}, reserved released",
        total_forfeited
    ).as_str());

    Ok(())
}
