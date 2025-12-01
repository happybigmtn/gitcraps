use ore_api::error::OreError;
use ore_api::prelude::*;
use solana_program::log::sol_log;
use solana_program::program::invoke;
use steel::*;

use super::utils::{point_to_index, sum_to_index, is_valid_yes_no_sum};

/// Expected size of the CrapsPosition struct (with 8-byte discriminator).
const CRAPS_POSITION_SIZE: usize = 8 + std::mem::size_of::<CrapsPosition>();

/// Calculate the maximum potential payout for a bet type and amount.
/// This helps ensure the house has sufficient bankroll to cover all possible outcomes.
fn calculate_max_payout(bet_type: u8, point: u8, amount: u64) -> Result<u64, ProgramError> {
    // Helper to calculate payout: amount * (numerator / denominator) + amount
    let calc = |num: u64, den: u64| -> Result<u64, ProgramError> {
        let payout = amount
            .checked_mul(num)
            .ok_or(OreError::ArithmeticOverflow)?
            .checked_div(den)
            .ok_or(OreError::ArithmeticOverflow)?;
        amount
            .checked_add(payout)
            .ok_or(OreError::ArithmeticOverflow.into())
    };

    match bet_type {
        // Pass Line (1:1)
        0 => calc(PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN),
        // Don't Pass (1:1)
        1 => calc(PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN),
        // Pass Odds - depends on point (2:1, 3:2, or 6:5)
        2 => {
            let (num, den) = match point {
                4 | 10 => (TRUE_ODDS_4_10_NUM, TRUE_ODDS_4_10_DEN),
                5 | 9 => (TRUE_ODDS_5_9_NUM, TRUE_ODDS_5_9_DEN),
                6 | 8 => (TRUE_ODDS_6_8_NUM, TRUE_ODDS_6_8_DEN),
                _ => return Ok(amount), // Shouldn't happen, but safe fallback
            };
            calc(num, den)
        }
        // Don't Pass Odds - inverse, but for reservation use same as pass odds
        3 => {
            let (num, den) = match point {
                4 | 10 => (TRUE_ODDS_4_10_NUM, TRUE_ODDS_4_10_DEN),
                5 | 9 => (TRUE_ODDS_5_9_NUM, TRUE_ODDS_5_9_DEN),
                6 | 8 => (TRUE_ODDS_6_8_NUM, TRUE_ODDS_6_8_DEN),
                _ => return Ok(amount),
            };
            calc(num, den)
        }
        // Come (1:1)
        4 => calc(PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN),
        // Don't Come (1:1)
        5 => calc(PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN),
        // Come Odds
        6 => {
            let (num, den) = match point {
                4 | 10 => (TRUE_ODDS_4_10_NUM, TRUE_ODDS_4_10_DEN),
                5 | 9 => (TRUE_ODDS_5_9_NUM, TRUE_ODDS_5_9_DEN),
                6 | 8 => (TRUE_ODDS_6_8_NUM, TRUE_ODDS_6_8_DEN),
                _ => return Ok(amount),
            };
            calc(num, den)
        }
        // Don't Come Odds
        7 => {
            let (num, den) = match point {
                4 | 10 => (TRUE_ODDS_4_10_NUM, TRUE_ODDS_4_10_DEN),
                5 | 9 => (TRUE_ODDS_5_9_NUM, TRUE_ODDS_5_9_DEN),
                6 | 8 => (TRUE_ODDS_6_8_NUM, TRUE_ODDS_6_8_DEN),
                _ => return Ok(amount),
            };
            calc(num, den)
        }
        // Place bet
        8 => {
            let (num, den) = match point {
                4 | 10 => (PLACE_4_10_PAYOUT_NUM, PLACE_4_10_PAYOUT_DEN),
                5 | 9 => (PLACE_5_9_PAYOUT_NUM, PLACE_5_9_PAYOUT_DEN),
                6 | 8 => (PLACE_6_8_PAYOUT_NUM, PLACE_6_8_PAYOUT_DEN),
                _ => return Ok(amount),
            };
            calc(num, den)
        }
        // Hardway
        9 => {
            let (num, den) = match point {
                4 | 10 => (HARD_4_10_PAYOUT_NUM, HARD_4_10_PAYOUT_DEN),
                6 | 8 => (HARD_6_8_PAYOUT_NUM, HARD_6_8_PAYOUT_DEN),
                _ => return Ok(amount),
            };
            calc(num, den)
        }
        // Field - worst case is 2:1
        10 => calc(FIELD_PAYOUT_2_12_NUM, FIELD_PAYOUT_2_12_DEN),
        // Any Seven (4:1)
        11 => calc(ANY_SEVEN_PAYOUT_NUM, ANY_SEVEN_PAYOUT_DEN),
        // Any Craps (7:1)
        12 => calc(ANY_CRAPS_PAYOUT_NUM, ANY_CRAPS_PAYOUT_DEN),
        // Yo Eleven (15:1)
        13 => calc(YO_ELEVEN_PAYOUT_NUM, YO_ELEVEN_PAYOUT_DEN),
        // Aces (30:1)
        14 => calc(ACES_PAYOUT_NUM, ACES_PAYOUT_DEN),
        // Twelve (30:1)
        15 => calc(TWELVE_PAYOUT_NUM, TWELVE_PAYOUT_DEN),
        // Yes bet (true odds) - sum before 7
        26 => {
            let (num, den) = match point {
                2 => (YES_2_PAYOUT_NUM, YES_2_PAYOUT_DEN),
                3 => (YES_3_PAYOUT_NUM, YES_3_PAYOUT_DEN),
                4 => (YES_4_PAYOUT_NUM, YES_4_PAYOUT_DEN),
                5 => (YES_5_PAYOUT_NUM, YES_5_PAYOUT_DEN),
                6 => (YES_6_PAYOUT_NUM, YES_6_PAYOUT_DEN),
                8 => (YES_8_PAYOUT_NUM, YES_8_PAYOUT_DEN),
                9 => (YES_9_PAYOUT_NUM, YES_9_PAYOUT_DEN),
                10 => (YES_10_PAYOUT_NUM, YES_10_PAYOUT_DEN),
                11 => (YES_11_PAYOUT_NUM, YES_11_PAYOUT_DEN),
                12 => (YES_12_PAYOUT_NUM, YES_12_PAYOUT_DEN),
                _ => return Ok(amount), // 7 is invalid
            };
            calc(num, den)
        }
        // No bet (inverse true odds) - 7 before sum
        27 => {
            let (num, den) = match point {
                2 => (NO_2_PAYOUT_NUM, NO_2_PAYOUT_DEN),
                3 => (NO_3_PAYOUT_NUM, NO_3_PAYOUT_DEN),
                4 => (NO_4_PAYOUT_NUM, NO_4_PAYOUT_DEN),
                5 => (NO_5_PAYOUT_NUM, NO_5_PAYOUT_DEN),
                6 => (NO_6_PAYOUT_NUM, NO_6_PAYOUT_DEN),
                8 => (NO_8_PAYOUT_NUM, NO_8_PAYOUT_DEN),
                9 => (NO_9_PAYOUT_NUM, NO_9_PAYOUT_DEN),
                10 => (NO_10_PAYOUT_NUM, NO_10_PAYOUT_DEN),
                11 => (NO_11_PAYOUT_NUM, NO_11_PAYOUT_DEN),
                12 => (NO_12_PAYOUT_NUM, NO_12_PAYOUT_DEN),
                _ => return Ok(amount), // 7 is invalid
            };
            calc(num, den)
        }
        // Next bet (single-roll true odds)
        28 => {
            let (num, den) = match point {
                2 => (HOP_2_PAYOUT_NUM, HOP_2_PAYOUT_DEN),
                3 => (HOP_3_PAYOUT_NUM, HOP_3_PAYOUT_DEN),
                4 => (HOP_4_PAYOUT_NUM, HOP_4_PAYOUT_DEN),
                5 => (HOP_5_PAYOUT_NUM, HOP_5_PAYOUT_DEN),
                6 => (HOP_6_PAYOUT_NUM, HOP_6_PAYOUT_DEN),
                7 => (HOP_7_PAYOUT_NUM, HOP_7_PAYOUT_DEN),
                8 => (HOP_8_PAYOUT_NUM, HOP_8_PAYOUT_DEN),
                9 => (HOP_9_PAYOUT_NUM, HOP_9_PAYOUT_DEN),
                10 => (HOP_10_PAYOUT_NUM, HOP_10_PAYOUT_DEN),
                11 => (HOP_11_PAYOUT_NUM, HOP_11_PAYOUT_DEN),
                12 => (HOP_12_PAYOUT_NUM, HOP_12_PAYOUT_DEN),
                _ => return Ok(amount),
            };
            calc(num, den)
        }
        _ => Ok(amount), // Invalid bet type, will be caught later
    }
}

/// Places a craps bet for the user.
pub fn process_place_craps_bet(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = PlaceCrapsBet::try_from_bytes(data)?;
    let bet_type = args.bet_type;
    let point = args.point;
    let amount = u64::from_le_bytes(args.amount);

    sol_log(&format!("PlaceCrapsBet: type={}, point={}, amount={}", bet_type, point, amount).as_str());

    // Load accounts.
    // Account layout:
    // 0: signer
    // 1: craps_game - game state PDA
    // 2: craps_position - user position PDA
    // 3: craps_vault - vault PDA (owner of vault token account)
    // 4: signer_crap_ata - signer's CRAP token account
    // 5: vault_crap_ata - craps vault's CRAP token account
    // 6: crap_mint - CRAP token mint
    // 7: system_program
    // 8: token_program
    // 9: associated_token_program
    let [signer_info, craps_game_info, craps_position_info, craps_vault_info, signer_crap_ata, vault_crap_ata, crap_mint, system_program, token_program, associated_token_program] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    craps_position_info
        .is_writable()?
        .has_seeds(&[CRAPS_POSITION, &signer_info.key.to_bytes()], &ore_api::ID)?;
    craps_vault_info.has_seeds(&[CRAPS_VAULT], &ore_api::ID)?;
    signer_crap_ata.is_writable()?;
    vault_crap_ata.is_writable()?;
    crap_mint.has_address(&CRAP_MINT_ADDRESS)?;
    system_program.is_program(&system_program::ID)?;
    token_program.is_program(&spl_token::ID)?;
    associated_token_program.is_program(&spl_associated_token_account::ID)?;

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
        craps_game.reserved_payouts = 0;
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
        // Check if account needs migration (legacy 600-byte accounts)
        let current_size = craps_position_info.data_len();
        if current_size < CRAPS_POSITION_SIZE {
            sol_log(&format!(
                "Migrating CrapsPosition: {} -> {} bytes",
                current_size, CRAPS_POSITION_SIZE
            ));

            // Calculate additional rent needed
            let rent = solana_program::rent::Rent::get()?;
            let current_rent = rent.minimum_balance(current_size);
            let new_rent = rent.minimum_balance(CRAPS_POSITION_SIZE);
            let additional_rent = new_rent.saturating_sub(current_rent);

            // Transfer additional rent if needed
            if additional_rent > 0 {
                solana_program::program::invoke(
                    &solana_program::system_instruction::transfer(
                        signer_info.key,
                        craps_position_info.key,
                        additional_rent,
                    ),
                    &[signer_info.clone(), craps_position_info.clone(), system_program.clone()],
                )?;
            }

            // Reallocate the account (new bytes are zero-initialized)
            craps_position_info.realloc(CRAPS_POSITION_SIZE, false)?;
            sol_log("CrapsPosition migration complete");
        }

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
        return Err(OreError::InvalidBetAmount.into());
    }

    // Add maximum bet validation
    if amount > ore_api::consts::MAX_BET_AMOUNT {
        sol_log("Bet exceeds maximum allowed amount");
        return Err(OreError::InvalidBetAmount.into());
    }

    // Calculate max potential payout for this bet
    let max_payout = calculate_max_payout(bet_type, point, amount)?;

    // Calculate available bankroll (total minus already reserved for pending bets)
    let available_bankroll = craps_game.house_bankroll
        .checked_sub(craps_game.reserved_payouts)
        .ok_or(OreError::InsufficientBankroll)?;

    // Check if this bet's max payout fits in available bankroll
    if max_payout > available_bankroll {
        sol_log("Bet exceeds available house bankroll (after reserved payouts)");
        return Err(OreError::InsufficientBankroll.into());
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
                return Err(OreError::InvalidBetType.into());
            }
            craps_position.pass_line = craps_position.pass_line
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Pass Line bet placed: {}", amount).as_str());
        }
        // Don't Pass - only allowed during come-out
        1 => { // DontPass
            if !is_come_out {
                sol_log("Don't Pass bet only allowed during come-out");
                return Err(OreError::InvalidBetType.into());
            }
            craps_position.dont_pass = craps_position.dont_pass
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Don't Pass bet placed: {}", amount).as_str());
        }
        // Pass Odds - only allowed after point established
        2 => { // PassOdds
            if !has_point {
                sol_log("Pass Odds only allowed after point established");
                return Err(OreError::InvalidBetType.into());
            }
            if craps_position.pass_line == 0 {
                sol_log("Must have Pass Line bet to place Pass Odds");
                return Err(OreError::InvalidBetType.into());
            }
            craps_position.pass_odds = craps_position.pass_odds
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Pass Odds bet placed: {}", amount).as_str());
        }
        // Don't Pass Odds - only allowed after point established
        3 => { // DontPassOdds
            if !has_point {
                sol_log("Don't Pass Odds only allowed after point established");
                return Err(OreError::InvalidBetType.into());
            }
            if craps_position.dont_pass == 0 {
                sol_log("Must have Don't Pass bet to place Don't Pass Odds");
                return Err(OreError::InvalidBetType.into());
            }
            craps_position.dont_pass_odds = craps_position.dont_pass_odds
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
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
                    .ok_or(OreError::ArithmeticOverflow)?;
                sol_log(&format!("Come bet placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Come bet");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // Don't Come
        5 => { // DontCome
            if let Some(idx) = point_to_index(point) {
                craps_position.dont_come_bets[idx] = craps_position.dont_come_bets[idx]
                    .checked_add(amount)
                    .ok_or(OreError::ArithmeticOverflow)?;
                sol_log(&format!("Don't Come bet placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Don't Come bet");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // Come Odds
        6 => { // ComeOdds
            if let Some(idx) = point_to_index(point) {
                if craps_position.come_bets[idx] == 0 {
                    sol_log("Must have Come bet to place Come Odds");
                    return Err(OreError::InvalidBetType.into());
                }
                craps_position.come_odds[idx] = craps_position.come_odds[idx]
                    .checked_add(amount)
                    .ok_or(OreError::ArithmeticOverflow)?;
                sol_log(&format!("Come Odds placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Come Odds");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // Don't Come Odds
        7 => { // DontComeOdds
            if let Some(idx) = point_to_index(point) {
                if craps_position.dont_come_bets[idx] == 0 {
                    sol_log("Must have Don't Come bet to place Don't Come Odds");
                    return Err(OreError::InvalidBetType.into());
                }
                craps_position.dont_come_odds[idx] = craps_position.dont_come_odds[idx]
                    .checked_add(amount)
                    .ok_or(OreError::ArithmeticOverflow)?;
                sol_log(&format!("Don't Come Odds placed on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Don't Come Odds");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // Place bet
        8 => { // Place
            if let Some(idx) = point_to_index(point) {
                craps_position.place_bets[idx] = craps_position.place_bets[idx]
                    .checked_add(amount)
                    .ok_or(OreError::ArithmeticOverflow)?;
                craps_position.set_place_working(true);
                sol_log(&format!("Place bet on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid point for Place bet");
                return Err(OreError::InvalidBetType.into());
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
                    .ok_or(OreError::ArithmeticOverflow)?;
                sol_log(&format!("Hardway bet on {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid hardway number (must be 4, 6, 8, or 10)");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // Field - single roll bet
        10 => { // Field
            craps_position.field_bet = craps_position.field_bet
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Field bet placed: {}", amount).as_str());
        }
        // Any Seven - single roll bet
        11 => { // AnySeven
            craps_position.any_seven = craps_position.any_seven
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Any Seven bet placed: {}", amount).as_str());
        }
        // Any Craps - single roll bet
        12 => { // AnyCraps
            craps_position.any_craps = craps_position.any_craps
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Any Craps bet placed: {}", amount).as_str());
        }
        // Yo Eleven - single roll bet
        13 => { // YoEleven
            craps_position.yo_eleven = craps_position.yo_eleven
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Yo Eleven bet placed: {}", amount).as_str());
        }
        // Aces (2) - single roll bet
        14 => { // Aces
            craps_position.aces = craps_position.aces
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Aces (2) bet placed: {}", amount).as_str());
        }
        // Twelve - single roll bet
        15 => { // Twelve
            craps_position.twelve = craps_position.twelve
                .checked_add(amount)
                .ok_or(OreError::ArithmeticOverflow)?;
            sol_log(&format!("Twelve bet placed: {}", amount).as_str());
        }
        // Yes bet (true odds) - sum rolls before 7
        26 => { // Yes (formerly Buy)
            // Valid for sums 2-12 except 7
            if is_valid_yes_no_sum(point) {
                if let Some(idx) = sum_to_index(point) {
                    craps_position.yes_bets[idx] = craps_position.yes_bets[idx]
                        .checked_add(amount)
                        .ok_or(OreError::ArithmeticOverflow)?;
                    sol_log(&format!("Yes bet on sum {}: {}", point, amount).as_str());
                } else {
                    sol_log("Invalid sum for Yes bet");
                    return Err(OreError::InvalidBetType.into());
                }
            } else {
                sol_log("Invalid sum for Yes bet (must be 2-12, not 7)");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // No bet (inverse true odds) - 7 rolls before sum
        27 => { // No (formerly Lay)
            // Valid for sums 2-12 except 7
            if is_valid_yes_no_sum(point) {
                if let Some(idx) = sum_to_index(point) {
                    craps_position.no_bets[idx] = craps_position.no_bets[idx]
                        .checked_add(amount)
                        .ok_or(OreError::ArithmeticOverflow)?;
                    sol_log(&format!("No bet on sum {}: {}", point, amount).as_str());
                } else {
                    sol_log("Invalid sum for No bet");
                    return Err(OreError::InvalidBetType.into());
                }
            } else {
                sol_log("Invalid sum for No bet (must be 2-12, not 7)");
                return Err(OreError::InvalidBetType.into());
            }
        }
        // Next bet (single-roll true odds)
        28 => { // Next (formerly Hop)
            // Point is the dice sum (2-12)
            if let Some(idx) = sum_to_index(point) {
                craps_position.next_bets[idx] = craps_position.next_bets[idx]
                    .checked_add(amount)
                    .ok_or(OreError::ArithmeticOverflow)?;
                sol_log(&format!("Next bet on sum {}: {}", point, amount).as_str());
            } else {
                sol_log("Invalid sum for Next bet (must be 2-12)");
                return Err(OreError::InvalidBetType.into());
            }
        }
        _ => {
            sol_log("Invalid bet type");
            return Err(OreError::InvalidBetType.into());
        }
    }

    // Update totals.
    craps_position.total_wagered = craps_position.total_wagered
        .checked_add(amount)
        .ok_or(OreError::ArithmeticOverflow)?;

    // Reserve this payout in the house bankroll
    craps_game.reserved_payouts = craps_game.reserved_payouts
        .checked_add(max_payout)
        .ok_or(OreError::ArithmeticOverflow)?;

    // Create vault's CRAP token account if it doesn't exist.
    if vault_crap_ata.data_is_empty() {
        create_associated_token_account(
            signer_info,
            craps_vault_info,
            vault_crap_ata,
            crap_mint,
            system_program,
            token_program,
            associated_token_program,
        )?;
        sol_log("Created craps vault CRAP token account");
    }

    // Transfer CRAP tokens from signer to craps vault.
    invoke(
        &spl_token::instruction::transfer(
            &spl_token::ID,
            signer_crap_ata.key,
            vault_crap_ata.key,
            signer_info.key,
            &[],
            amount,
        )?,
        &[
            signer_crap_ata.clone(),
            vault_crap_ata.clone(),
            signer_info.clone(),
            token_program.clone(),
        ],
    )?;

    // Update house bankroll tracking.
    craps_game.house_bankroll = craps_game.house_bankroll
        .checked_add(amount)
        .ok_or(OreError::ArithmeticOverflow)?;

    sol_log(&format!("Total wagered: {}, House bankroll: {}, Reserved payouts: {}",
        craps_position.total_wagered,
        craps_game.house_bankroll,
        craps_game.reserved_payouts
    ).as_str());

    Ok(())
}
