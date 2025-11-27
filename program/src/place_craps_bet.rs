use ore_api::prelude::*;
use solana_program::log::sol_log;
use steel::*;

use crate::craps_utils::point_to_index;

/// Places a craps bet for the user.
pub fn process_place_craps_bet(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = PlaceCrapsBet::try_from_bytes(data)?;
    let bet_type = args.bet_type;
    let point = args.point;
    let amount = u64::from_le_bytes(args.amount);

    sol_log(&format!("PlaceCrapsBet: type={}, point={}, amount={}", bet_type, point, amount).as_str());

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

    // Load or create craps game account.
    let craps_game = if craps_game_info.data_is_empty() {
        // Initialize craps game if it doesn't exist.
        create_program_account::<CrapsGame>(
            craps_game_info,
            system_program,
            signer_info,
            &ore_api::ID,
            &[CRAPS_GAME],
        )?;
        let craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
        craps_game.epoch_id = 1;
        craps_game.point = 0;
        craps_game.is_come_out = 1; // Start in come-out phase
        craps_game.epoch_start_round = 0;
        craps_game.house_bankroll = 0;
        craps_game.total_payouts = 0;
        craps_game.total_collected = 0;
        craps_game
    } else {
        craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?
    };

    // Load or create craps position account.
    let craps_position = if craps_position_info.data_is_empty() {
        create_program_account::<CrapsPosition>(
            craps_position_info,
            system_program,
            signer_info,
            &ore_api::ID,
            &[CRAPS_POSITION, &signer_info.key.to_bytes()],
        )?;
        let position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;
        position.authority = *signer_info.key;
        position.epoch_id = craps_game.epoch_id;
        position
    } else {
        let position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;
        // Verify signer is the position authority
        if position.authority != *signer_info.key {
            sol_log("Signer is not the position authority");
            return Err(ProgramError::IllegalOwner);
        }
        // If position is from old epoch, reset it.
        if position.epoch_id != craps_game.epoch_id {
            position.reset_for_epoch(craps_game.epoch_id);
        }
        position
    };

    // Validate bet amount.
    if amount == 0 {
        return Err(ProgramError::InvalidArgument);
    }

    // Add maximum bet validation
    if amount > ore_api::consts::MAX_BET_AMOUNT {
        sol_log("Bet exceeds maximum allowed amount");
        return Err(ProgramError::InvalidArgument);
    }

    // Dynamic limit based on house bankroll capacity
    // Max potential payout shouldn't exceed house bankroll
    let max_payout_multiplier = 36u64; // Worst case for single number bets
    if let Some(max_payout) = amount.checked_mul(max_payout_multiplier) {
        if max_payout > craps_game.house_bankroll {
            sol_log("Bet exceeds house bankroll capacity");
            return Err(ProgramError::InsufficientFunds);
        }
    }

    // Check if bet is valid based on game state.
    let is_come_out = craps_game.is_coming_out();
    let has_point = craps_game.has_point();

    // Process bet based on type.
    match bet_type {
        // Pass Line - only allowed during come-out
        0 => { // PassLine
            if !is_come_out {
                sol_log("Pass Line bet only allowed during come-out");
                return Err(ProgramError::InvalidArgument);
            }
            craps_position.pass_line = craps_position.pass_line
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Pass Line bet placed: {}", amount).as_str());
        }
        // Don't Pass - only allowed during come-out
        1 => { // DontPass
            if !is_come_out {
                sol_log("Don't Pass bet only allowed during come-out");
                return Err(ProgramError::InvalidArgument);
            }
            craps_position.dont_pass = craps_position.dont_pass
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Don't Pass bet placed: {}", amount).as_str());
        }
        // Pass Odds - only allowed after point established
        2 => { // PassOdds
            if !has_point {
                sol_log("Pass Odds only allowed after point established");
                return Err(ProgramError::InvalidArgument);
            }
            if craps_position.pass_line == 0 {
                sol_log("Must have Pass Line bet to place Pass Odds");
                return Err(ProgramError::InvalidArgument);
            }
            craps_position.pass_odds = craps_position.pass_odds
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Pass Odds bet placed: {}", amount).as_str());
        }
        // Don't Pass Odds - only allowed after point established
        3 => { // DontPassOdds
            if !has_point {
                sol_log("Don't Pass Odds only allowed after point established");
                return Err(ProgramError::InvalidArgument);
            }
            if craps_position.dont_pass == 0 {
                sol_log("Must have Don't Pass bet to place Don't Pass Odds");
                return Err(ProgramError::InvalidArgument);
            }
            craps_position.dont_pass_odds = craps_position.dont_pass_odds
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Don't Pass Odds bet placed: {}", amount).as_str());
        }
        // Come - only allowed after point established (not during come-out)
        4 => { // Come
            // Come bets can be placed anytime, they act like Pass Line for that roll
            // For simplicity, we store Come bets that don't yet have a point in come_bets[0-5]
            // based on the point they travel to.
            // Actually, let's store a "pending come bet" separately...
            // For now, we'll just use the point parameter to indicate where the come bet goes.
            if let Some(idx) = point_to_index(point) {
                craps_position.come_bets[idx] = craps_position.come_bets[idx]
                    .checked_add(amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                sol_log(&format!("Come bet placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Come bet");
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Don't Come
        5 => { // DontCome
            if let Some(idx) = point_to_index(point) {
                craps_position.dont_come_bets[idx] = craps_position.dont_come_bets[idx]
                    .checked_add(amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                sol_log(&format!("Don't Come bet placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Don't Come bet");
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Come Odds
        6 => { // ComeOdds
            if let Some(idx) = point_to_index(point) {
                if craps_position.come_bets[idx] == 0 {
                    sol_log("Must have Come bet to place Come Odds");
                    return Err(ProgramError::InvalidArgument);
                }
                craps_position.come_odds[idx] = craps_position.come_odds[idx]
                    .checked_add(amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                sol_log(&format!("Come Odds placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Come Odds");
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Don't Come Odds
        7 => { // DontComeOdds
            if let Some(idx) = point_to_index(point) {
                if craps_position.dont_come_bets[idx] == 0 {
                    sol_log("Must have Don't Come bet to place Don't Come Odds");
                    return Err(ProgramError::InvalidArgument);
                }
                craps_position.dont_come_odds[idx] = craps_position.dont_come_odds[idx]
                    .checked_add(amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                sol_log(&format!("Don't Come Odds placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Don't Come Odds");
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Place bet
        8 => { // Place
            if let Some(idx) = point_to_index(point) {
                craps_position.place_bets[idx] = craps_position.place_bets[idx]
                    .checked_add(amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                craps_position.set_place_working(true);
                sol_log(&format!("Place bet on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Place bet");
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Hardway
        9 => { // Hardway
            let hardway_idx = match point {
                4 => Some(0),
                6 => Some(1),
                8 => Some(2),
                10 => Some(3),
                _ => None,
            };
            if let Some(idx) = hardway_idx {
                craps_position.hardways[idx] = craps_position.hardways[idx]
                    .checked_add(amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                sol_log(&format!("Hardway bet on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid hardway number (must be 4, 6, 8, or 10)");
                return Err(ProgramError::InvalidArgument);
            }
        }
        // Field - single roll bet
        10 => { // Field
            craps_position.field_bet = craps_position.field_bet
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Field bet placed: {}", amount).as_str());
        }
        // Any Seven - single roll bet
        11 => { // AnySeven
            craps_position.any_seven = craps_position.any_seven
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Any Seven bet placed: {}", amount).as_str());
        }
        // Any Craps - single roll bet
        12 => { // AnyCraps
            craps_position.any_craps = craps_position.any_craps
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Any Craps bet placed: {}", amount).as_str());
        }
        // Yo Eleven - single roll bet
        13 => { // YoEleven
            craps_position.yo_eleven = craps_position.yo_eleven
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Yo Eleven bet placed: {}", amount).as_str());
        }
        // Aces (2) - single roll bet
        14 => { // Aces
            craps_position.aces = craps_position.aces
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Aces (2) bet placed: {}", amount).as_str());
        }
        // Twelve - single roll bet
        15 => { // Twelve
            craps_position.twelve = craps_position.twelve
                .checked_add(amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            sol_log(&format!("Twelve bet placed: {}", amount).as_str());
        }
        _ => {
            sol_log("Invalid bet type");
            return Err(ProgramError::InvalidArgument);
        }
    }

    // Update totals.
    craps_position.total_wagered = craps_position.total_wagered
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    // Transfer SOL from signer to craps game (house bankroll).
    craps_game_info.collect(amount, &signer_info)?;
    craps_game.house_bankroll = craps_game.house_bankroll
        .checked_add(amount)
        .ok_or(ProgramError::ArithmeticOverflow)?;

    sol_log(&format!("Total wagered: {}, House bankroll: {}",
        craps_position.total_wagered,
        craps_game.house_bankroll
    ).as_str());

    Ok(())
}
