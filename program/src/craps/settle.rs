use ore_api::prelude::*;
use ore_api::state::{index_to_point, NUM_POINTS, NUM_HARDWAYS};
use solana_program::log::sol_log;
use steel::*;

use super::utils::{
    square_to_dice_sum, is_hardway, is_craps, is_natural, is_point_number,
    is_field_winner, hardway_loses, calculate_payout,
};

/// Helper to calculate and release reserved payout for a settled bet.
/// Uses saturating_sub to safely handle edge cases.
fn release_reserved_payout(craps_game: &mut CrapsGame, bet_amount: u64, payout_num: u64, payout_den: u64) {
    // Calculate the max payout that was reserved (bet + winnings)
    let payout = bet_amount
        .saturating_mul(payout_num)
        .saturating_div(payout_den.max(1)); // Avoid division by zero
    let max_payout = bet_amount.saturating_add(payout);

    // Release the reserved amount
    craps_game.reserved_payouts = craps_game.reserved_payouts.saturating_sub(max_payout);
}

/// Settles craps bets for a user after a round is complete.
/// This should be called after reset() determines the winning square.
pub fn process_settle_craps(accounts: &[AccountInfo<'_>], data: &[u8]) -> ProgramResult {
    // Parse instruction data.
    let args = SettleCraps::try_from_bytes(data)?;
    let winning_square = u64::from_le_bytes(args.winning_square) as usize;

    #[cfg(feature = "debug")]
    sol_log(&format!("SettleCraps: winning_square={}", winning_square).as_str());

    // Load accounts.
    let [signer_info, craps_game_info, craps_position_info, round_info] = accounts else {
        return Err(ProgramError::NotEnoughAccountKeys);
    };

    signer_info.is_signer()?;
    craps_game_info
        .is_writable()?
        .has_seeds(&[CRAPS_GAME], &ore_api::ID)?;
    craps_position_info
        .is_writable()?
        .has_seeds(&[CRAPS_POSITION, &signer_info.key.to_bytes()], &ore_api::ID)?;
    // Round info is just for verification that settlement is valid.
    let round = round_info.as_account::<Round>(&ore_api::ID)?;

    // Validate that the winning square matches the round's result.
    let Some(rng) = round.rng() else {
        sol_log("Round has no valid RNG");
        return Err(ProgramError::InvalidAccountData);
    };
    let actual_winning_square = round.winning_square(rng);
    if actual_winning_square != winning_square {
        sol_log(&format!("Winning square mismatch: expected {}, got {}", actual_winning_square, winning_square).as_str());
        return Err(ProgramError::InvalidArgument);
    }

    // Load craps game and position.
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

    let craps_game = craps_game_info.as_account_mut::<CrapsGame>(&ore_api::ID)?;
    let craps_position = craps_position_info.as_account_mut::<CrapsPosition>(&ore_api::ID)?;

    // Check if position is for current epoch.
    if craps_position.epoch_id != craps_game.epoch_id {
        sol_log("Position from different epoch - refunding active bets");

        // Calculate total active bets that need refund
        let total_refund = craps_position.pass_line
            .checked_add(craps_position.dont_pass).unwrap_or(0)
            .checked_add(craps_position.pass_odds).unwrap_or(0)
            .checked_add(craps_position.dont_pass_odds).unwrap_or(0)
            .checked_add(craps_position.field_bet).unwrap_or(0)
            .checked_add(craps_position.any_seven).unwrap_or(0)
            .checked_add(craps_position.any_craps).unwrap_or(0)
            .checked_add(craps_position.yo_eleven).unwrap_or(0)
            .checked_add(craps_position.aces).unwrap_or(0)
            .checked_add(craps_position.twelve).unwrap_or(0);

        // Add array bets
        let array_total: u64 = craps_position.come_bets.iter().sum::<u64>()
            + craps_position.come_odds.iter().sum::<u64>()
            + craps_position.dont_come_bets.iter().sum::<u64>()
            + craps_position.dont_come_odds.iter().sum::<u64>()
            + craps_position.place_bets.iter().sum::<u64>()
            + craps_position.hardways.iter().sum::<u64>();

        let total_refund = total_refund.checked_add(array_total).unwrap_or(total_refund);

        if total_refund > 0 {
            // Refund via pending_winnings
            craps_position.pending_winnings = craps_position.pending_winnings
                .checked_add(total_refund)
                .unwrap_or(craps_position.pending_winnings);

            sol_log(&format!("Refunded {} lamports from old epoch", total_refund).as_str());
        }

        // Reset position for new epoch
        craps_position.epoch_id = craps_game.epoch_id;
        craps_position.last_updated_round = round.id;

        // Clear all bets
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
        craps_position.hardways = [0; 4];

        return Ok(());
    }

    // Check if already settled for this round.
    if craps_position.last_updated_round >= round.id {
        sol_log("Already settled for this round");
        return Err(ProgramError::Custom(1)); // Error code 1: ALREADY_SETTLED
    }

    // Early exit if no bets to settle - optimization to avoid iterating through empty bet slots
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
        || craps_position.hardways.iter().any(|&x| x > 0)
        || craps_position.place_bets.iter().any(|&x| x > 0)
        || craps_position.come_bets.iter().any(|&x| x > 0)
        || craps_position.come_odds.iter().any(|&x| x > 0)
        || craps_position.dont_come_bets.iter().any(|&x| x > 0)
        || craps_position.dont_come_odds.iter().any(|&x| x > 0);

    if !has_any_bets {
        sol_log("No active bets to settle");
        craps_position.last_updated_round = round.id;
        // Skip all settlement logic
        return Ok(());
    }

    // Get dice info from winning square.
    let dice_sum = square_to_dice_sum(winning_square);
    let is_hard = is_hardway(winning_square);

    #[cfg(feature = "debug")]
    sol_log(&format!("Dice sum: {}, is_hard: {}", dice_sum, is_hard).as_str());

    let mut total_winnings: u64 = 0;
    let mut total_lost: u64 = 0;

    // ==================== SINGLE-ROLL BETS ====================
    // These are always resolved immediately.

    // Field bet: wins on 2, 3, 4, 9, 10, 11, 12
    if craps_position.field_bet > 0 {
        if is_field_winner(dice_sum) {
            let (num, den) = if dice_sum == 2 || dice_sum == 12 {
                (FIELD_PAYOUT_2_12_NUM, FIELD_PAYOUT_2_12_DEN)
            } else {
                (FIELD_PAYOUT_NORMAL_NUM, FIELD_PAYOUT_NORMAL_DEN)
            };
            let payout = calculate_payout(craps_position.field_bet, num, den);
            let win_amount = craps_position.field_bet
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Field bet won: {} + {}", craps_position.field_bet, payout).as_str());
        } else {
            total_lost = total_lost
                .checked_add(craps_position.field_bet)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Field bet lost: {}", craps_position.field_bet).as_str());
        }
        // Release reserved payout (worst case 2:1 for field)
        release_reserved_payout(craps_game, craps_position.field_bet, FIELD_PAYOUT_2_12_NUM, FIELD_PAYOUT_2_12_DEN);
        craps_position.field_bet = 0;
    }

    // Any Seven: wins on 7
    if craps_position.any_seven > 0 {
        if dice_sum == 7 {
            let payout = calculate_payout(craps_position.any_seven, ANY_SEVEN_PAYOUT_NUM, ANY_SEVEN_PAYOUT_DEN);
            let win_amount = craps_position.any_seven
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Any Seven won: {} + {}", craps_position.any_seven, payout).as_str());
        } else {
            total_lost = total_lost
                .checked_add(craps_position.any_seven)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        release_reserved_payout(craps_game, craps_position.any_seven, ANY_SEVEN_PAYOUT_NUM, ANY_SEVEN_PAYOUT_DEN);
        craps_position.any_seven = 0;
    }

    // Any Craps: wins on 2, 3, or 12
    if craps_position.any_craps > 0 {
        if is_craps(dice_sum) {
            let payout = calculate_payout(craps_position.any_craps, ANY_CRAPS_PAYOUT_NUM, ANY_CRAPS_PAYOUT_DEN);
            let win_amount = craps_position.any_craps
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Any Craps won: {} + {}", craps_position.any_craps, payout).as_str());
        } else {
            total_lost = total_lost
                .checked_add(craps_position.any_craps)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        release_reserved_payout(craps_game, craps_position.any_craps, ANY_CRAPS_PAYOUT_NUM, ANY_CRAPS_PAYOUT_DEN);
        craps_position.any_craps = 0;
    }

    // Yo Eleven: wins on 11
    if craps_position.yo_eleven > 0 {
        if dice_sum == 11 {
            let payout = calculate_payout(craps_position.yo_eleven, YO_ELEVEN_PAYOUT_NUM, YO_ELEVEN_PAYOUT_DEN);
            let win_amount = craps_position.yo_eleven
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Yo Eleven won: {} + {}", craps_position.yo_eleven, payout).as_str());
        } else {
            total_lost = total_lost
                .checked_add(craps_position.yo_eleven)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        release_reserved_payout(craps_game, craps_position.yo_eleven, YO_ELEVEN_PAYOUT_NUM, YO_ELEVEN_PAYOUT_DEN);
        craps_position.yo_eleven = 0;
    }

    // Aces: wins on 2
    if craps_position.aces > 0 {
        if dice_sum == 2 {
            let payout = calculate_payout(craps_position.aces, ACES_PAYOUT_NUM, ACES_PAYOUT_DEN);
            let win_amount = craps_position.aces
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Aces won: {} + {}", craps_position.aces, payout).as_str());
        } else {
            total_lost = total_lost
                .checked_add(craps_position.aces)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        release_reserved_payout(craps_game, craps_position.aces, ACES_PAYOUT_NUM, ACES_PAYOUT_DEN);
        craps_position.aces = 0;
    }

    // Twelve: wins on 12
    if craps_position.twelve > 0 {
        if dice_sum == 12 {
            let payout = calculate_payout(craps_position.twelve, TWELVE_PAYOUT_NUM, TWELVE_PAYOUT_DEN);
            let win_amount = craps_position.twelve
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Twelve won: {} + {}", craps_position.twelve, payout).as_str());
        } else {
            total_lost = total_lost
                .checked_add(craps_position.twelve)
                .ok_or(ProgramError::ArithmeticOverflow)?;
        }
        release_reserved_payout(craps_game, craps_position.twelve, TWELVE_PAYOUT_NUM, TWELVE_PAYOUT_DEN);
        craps_position.twelve = 0;
    }

    // ==================== HARDWAYS ====================
    // Lose on 7 or easy way, win on hardway.

    for i in 0..NUM_HARDWAYS {
        if craps_position.hardways[i] > 0 {
            let hardway_num = match i {
                0 => 4,
                1 => 6,
                2 => 8,
                3 => 10,
                _ => continue,
            };

            let (num, den) = if hardway_num == 4 || hardway_num == 10 {
                (HARD_4_10_PAYOUT_NUM, HARD_4_10_PAYOUT_DEN)
            } else {
                (HARD_6_8_PAYOUT_NUM, HARD_6_8_PAYOUT_DEN)
            };

            if dice_sum == hardway_num && is_hard {
                // Won! Hardway hit.
                let payout = calculate_payout(craps_position.hardways[i], num, den);
                let win_amount = craps_position.hardways[i]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Hard {} won: {} + {}", hardway_num, craps_position.hardways[i], payout).as_str());
                release_reserved_payout(craps_game, craps_position.hardways[i], num, den);
                craps_position.hardways[i] = 0;
            } else if hardway_loses(winning_square, hardway_num) {
                // Lost on 7 or easy way.
                total_lost = total_lost
                    .checked_add(craps_position.hardways[i])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Hard {} lost", hardway_num).as_str());
                release_reserved_payout(craps_game, craps_position.hardways[i], num, den);
                craps_position.hardways[i] = 0;
            }
            // Otherwise bet stays active.
        }
    }

    // ==================== PLACE BETS ====================
    // Win if number hits, lose on 7.

    if craps_position.are_place_bets_working() {
        for i in 0..NUM_POINTS {
            if craps_position.place_bets[i] > 0 {
                let point_num = match index_to_point(i) {
                    Some(p) => p,
                    None => continue,
                };

                let (num, den) = get_place_payout(point_num);

                if dice_sum == point_num {
                    // Place bet won!
                    let payout = calculate_payout(craps_position.place_bets[i], num, den);
                    let win_amount = craps_position.place_bets[i]
                        .checked_add(payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Place {} won: {} + {}", point_num, craps_position.place_bets[i], payout).as_str());
                    release_reserved_payout(craps_game, craps_position.place_bets[i], num, den);
                    craps_position.place_bets[i] = 0;
                } else if dice_sum == 7 {
                    // Place bet lost on 7.
                    total_lost = total_lost
                        .checked_add(craps_position.place_bets[i])
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Place {} lost on 7", point_num).as_str());
                    release_reserved_payout(craps_game, craps_position.place_bets[i], num, den);
                    craps_position.place_bets[i] = 0;
                }
            }
        }
    }

    // ==================== COME BETS ====================
    // Win if number hits, lose on 7.

    for i in 0..NUM_POINTS {
        // Come bets
        if craps_position.come_bets[i] > 0 {
            let point_num = match index_to_point(i) {
                Some(p) => p,
                None => continue,
            };

            if dice_sum == point_num {
                // Come bet won!
                let payout = craps_position.come_bets[i]; // 1:1
                let win_amount = craps_position.come_bets[i]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                // Release come bet reservation (1:1 payout)
                release_reserved_payout(craps_game, craps_position.come_bets[i], PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);

                // Also pay come odds if any.
                if craps_position.come_odds[i] > 0 {
                    let (num, den) = get_true_odds_payout(point_num);
                    let odds_payout = calculate_payout(craps_position.come_odds[i], num, den);
                    let odds_win_amount = craps_position.come_odds[i]
                        .checked_add(odds_payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(odds_win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Come {} + odds won: {} + {}", point_num, craps_position.come_bets[i] + craps_position.come_odds[i], payout + odds_payout).as_str());
                    // Release come odds reservation
                    release_reserved_payout(craps_game, craps_position.come_odds[i], num, den);
                    craps_position.come_odds[i] = 0;
                }
                craps_position.come_bets[i] = 0;
            } else if dice_sum == 7 {
                // Come bet lost on 7.
                let lost_amount = craps_position.come_bets[i]
                    .checked_add(craps_position.come_odds[i])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_lost = total_lost
                    .checked_add(lost_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Come {} lost on 7", point_num).as_str());
                // Release come bet reservation
                release_reserved_payout(craps_game, craps_position.come_bets[i], PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                // Release come odds reservation if any
                if craps_position.come_odds[i] > 0 {
                    let (num, den) = get_true_odds_payout(point_num);
                    release_reserved_payout(craps_game, craps_position.come_odds[i], num, den);
                }
                craps_position.come_bets[i] = 0;
                craps_position.come_odds[i] = 0;
            }
        }

        // Don't Come bets
        if craps_position.dont_come_bets[i] > 0 {
            let point_num = match index_to_point(i) {
                Some(p) => p,
                None => continue,
            };

            if dice_sum == 7 {
                // Don't Come bet won!
                let payout = craps_position.dont_come_bets[i]; // 1:1
                let win_amount = craps_position.dont_come_bets[i]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                // Release don't come bet reservation
                release_reserved_payout(craps_game, craps_position.dont_come_bets[i], PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);

                // Also pay don't come odds if any.
                if craps_position.dont_come_odds[i] > 0 {
                    // For reservation, use the same payout as regular odds (worst case)
                    let (num, den) = get_true_odds_payout(point_num);
                    let odds_payout = calculate_payout(craps_position.dont_come_odds[i], num, den);
                    let odds_win_amount = craps_position.dont_come_odds[i]
                        .checked_add(odds_payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(odds_win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Don't Come {} + odds won: {}", point_num, payout + odds_payout).as_str());
                    // Release don't come odds reservation
                    release_reserved_payout(craps_game, craps_position.dont_come_odds[i], num, den);
                    craps_position.dont_come_odds[i] = 0;
                }
                craps_position.dont_come_bets[i] = 0;
            } else if dice_sum == point_num {
                // Don't Come bet lost when point hit.
                let lost_amount = craps_position.dont_come_bets[i]
                    .checked_add(craps_position.dont_come_odds[i])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_lost = total_lost
                    .checked_add(lost_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Don't Come {} lost on point", point_num).as_str());
                // Release don't come bet reservation
                release_reserved_payout(craps_game, craps_position.dont_come_bets[i], PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                // Release don't come odds reservation if any
                if craps_position.dont_come_odds[i] > 0 {
                    let (num, den) = get_true_odds_payout(point_num);
                    release_reserved_payout(craps_game, craps_position.dont_come_odds[i], num, den);
                }
                craps_position.dont_come_bets[i] = 0;
                craps_position.dont_come_odds[i] = 0;
            }
        }
    }

    // ==================== LINE BETS ====================
    // These depend on the game state (come-out vs point phase).

    let is_come_out = craps_game.is_coming_out();
    let current_point = craps_game.get_point();

    if is_come_out {
        // Come-out roll rules:
        // - Pass Line wins on 7 or 11 (natural)
        // - Pass Line loses on 2, 3, or 12 (craps)
        // - Don't Pass wins on 2 or 3, pushes on 12, loses on 7 or 11
        // - Any other number establishes the point

        if is_natural(dice_sum) {
            // Pass Line wins.
            if craps_position.pass_line > 0 {
                let payout = craps_position.pass_line; // 1:1
                let win_amount = craps_position.pass_line
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Pass Line won on {}: {} + {}", dice_sum, craps_position.pass_line, payout).as_str());
                release_reserved_payout(craps_game, craps_position.pass_line, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                craps_position.pass_line = 0;
            }
            // Don't Pass loses.
            if craps_position.dont_pass > 0 {
                total_lost = total_lost
                    .checked_add(craps_position.dont_pass)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Don't Pass lost on {}", dice_sum).as_str());
                release_reserved_payout(craps_game, craps_position.dont_pass, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                craps_position.dont_pass = 0;
            }
        } else if is_craps(dice_sum) {
            // Pass Line loses.
            if craps_position.pass_line > 0 {
                total_lost = total_lost
                    .checked_add(craps_position.pass_line)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Pass Line lost on craps {}", dice_sum).as_str());
                release_reserved_payout(craps_game, craps_position.pass_line, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                craps_position.pass_line = 0;
            }
            // Don't Pass wins on 2 or 3, pushes on 12.
            if craps_position.dont_pass > 0 {
                if dice_sum == 12 {
                    // Push - return bet.
                    total_winnings = total_winnings
                        .checked_add(craps_position.dont_pass)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    sol_log("Don't Pass push on 12".to_string().as_str());
                } else {
                    // Win on 2 or 3.
                    let payout = craps_position.dont_pass;
                    let win_amount = craps_position.dont_pass
                        .checked_add(payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Don't Pass won on {}: {} + {}", dice_sum, craps_position.dont_pass, payout).as_str());
                }
                release_reserved_payout(craps_game, craps_position.dont_pass, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                craps_position.dont_pass = 0;
            }
        } else if is_point_number(dice_sum) {
            // Point is established.
            craps_game.set_point(dice_sum);
            #[cfg(feature = "debug")]
            sol_log(&format!("Point established: {}", dice_sum).as_str());
            // Line bets stay active.
        }
    } else {
        // Point phase rules:
        // - Pass Line wins if point is hit, loses on 7
        // - Don't Pass wins on 7, loses if point is hit
        // - Odds bets pay true odds

        let point = current_point.unwrap_or(0);

        if dice_sum == point {
            // Point hit! Pass Line wins.
            if craps_position.pass_line > 0 {
                let payout = craps_position.pass_line; // 1:1
                let win_amount = craps_position.pass_line
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Pass Line won on point {}: {} + {}", point, craps_position.pass_line, payout).as_str());
                release_reserved_payout(craps_game, craps_position.pass_line, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);

                // Pay pass odds if any.
                if craps_position.pass_odds > 0 {
                    let (num, den) = get_true_odds_payout(point);
                    let odds_payout = calculate_payout(craps_position.pass_odds, num, den);
                    let odds_win_amount = craps_position.pass_odds
                        .checked_add(odds_payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(odds_win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Pass Odds won: {} + {}", craps_position.pass_odds, odds_payout).as_str());
                    release_reserved_payout(craps_game, craps_position.pass_odds, num, den);
                    craps_position.pass_odds = 0;
                }
                craps_position.pass_line = 0;
            }

            // Don't Pass loses.
            if craps_position.dont_pass > 0 {
                let lost_amount = craps_position.dont_pass
                    .checked_add(craps_position.dont_pass_odds)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_lost = total_lost
                    .checked_add(lost_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Don't Pass lost on point {}", point).as_str());
                release_reserved_payout(craps_game, craps_position.dont_pass, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                if craps_position.dont_pass_odds > 0 {
                    // Use true odds payout for reservation (worst case)
                    let (num, den) = get_true_odds_payout(point);
                    release_reserved_payout(craps_game, craps_position.dont_pass_odds, num, den);
                }
                craps_position.dont_pass = 0;
                craps_position.dont_pass_odds = 0;
            }

            // Point was made - return to come-out for same shooter.
            craps_game.clear_point();
            sol_log("Point made! Returning to come-out.".to_string().as_str());

        } else if dice_sum == 7 {
            // Seven-out! Pass Line loses.
            if craps_position.pass_line > 0 {
                let lost_amount = craps_position.pass_line
                    .checked_add(craps_position.pass_odds)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_lost = total_lost
                    .checked_add(lost_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Pass Line lost on 7-out: {}", craps_position.pass_line + craps_position.pass_odds).as_str());
                release_reserved_payout(craps_game, craps_position.pass_line, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                if craps_position.pass_odds > 0 {
                    let (num, den) = get_true_odds_payout(point);
                    release_reserved_payout(craps_game, craps_position.pass_odds, num, den);
                }
                craps_position.pass_line = 0;
                craps_position.pass_odds = 0;
            }

            // Don't Pass wins.
            if craps_position.dont_pass > 0 {
                let payout = craps_position.dont_pass; // 1:1
                let win_amount = craps_position.dont_pass
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;

                // Pay don't pass odds if any.
                if craps_position.dont_pass_odds > 0 {
                    let (num, den) = get_dont_true_odds_payout(point);
                    let odds_payout = calculate_payout(craps_position.dont_pass_odds, num, den);
                    let odds_win_amount = craps_position.dont_pass_odds
                        .checked_add(odds_payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(odds_win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Don't Pass Odds won: {} + {}", craps_position.dont_pass_odds, odds_payout).as_str());
                    // Use true odds for reservation (worst case)
                    let (num_res, den_res) = get_true_odds_payout(point);
                    release_reserved_payout(craps_game, craps_position.dont_pass_odds, num_res, den_res);
                    craps_position.dont_pass_odds = 0;
                }
                release_reserved_payout(craps_game, craps_position.dont_pass, PASS_LINE_PAYOUT_NUM, PASS_LINE_PAYOUT_DEN);
                craps_position.dont_pass = 0;
                #[cfg(feature = "debug")]
                sol_log(&format!("Don't Pass won on 7-out: {}", payout).as_str());
            }

            // New epoch - seven out ends the shooter's turn.
            craps_game.start_new_epoch(round.id);
            #[cfg(feature = "debug")]
            sol_log(&format!("Seven-out! New epoch: {}", craps_game.epoch_id).as_str());

            // Reset position for new epoch.
            craps_position.reset_for_epoch(craps_game.epoch_id);
        }
    }

    // Update position tracking.
    craps_position.pending_winnings = craps_position.pending_winnings
        .checked_add(total_winnings)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    craps_position.total_won = craps_position.total_won
        .checked_add(total_winnings)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    craps_position.total_lost = craps_position.total_lost
        .checked_add(total_lost)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    craps_position.last_updated_round = round.id;

    // Update house bankroll.
    craps_game.total_payouts = craps_game.total_payouts
        .checked_add(total_winnings)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    craps_game.total_collected = craps_game.total_collected
        .checked_add(total_lost)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    // House bankroll is reduced by net winnings.
    if total_winnings > total_lost {
        let net_payout = total_winnings
            .checked_sub(total_lost)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        // MUST fail transaction if house cannot pay
        if net_payout > 0 {
            if craps_game.house_bankroll < net_payout {
                sol_log("ERROR: Insufficient house bankroll for payout");
                return Err(ProgramError::InsufficientFunds);
            }
            craps_game.house_bankroll = craps_game.house_bankroll
                .checked_sub(net_payout)
                .ok_or(ProgramError::InsufficientFunds)?;
        }
    } else {
        let net_gain = total_lost
            .checked_sub(total_winnings)
            .ok_or(ProgramError::ArithmeticOverflow)?;
        craps_game.house_bankroll = craps_game.house_bankroll
            .checked_add(net_gain)
            .ok_or(ProgramError::ArithmeticOverflow)?;
    }

    #[cfg(feature = "debug")]
    sol_log(&format!("Settlement complete: won={}, lost={}, pending={}",
        total_winnings, total_lost, craps_position.pending_winnings).as_str());

    Ok(())
}

/// Get place bet payout ratio.
fn get_place_payout(point: u8) -> (u64, u64) {
    match point {
        4 | 10 => (PLACE_4_10_PAYOUT_NUM, PLACE_4_10_PAYOUT_DEN),
        5 | 9 => (PLACE_5_9_PAYOUT_NUM, PLACE_5_9_PAYOUT_DEN),
        6 | 8 => (PLACE_6_8_PAYOUT_NUM, PLACE_6_8_PAYOUT_DEN),
        _ => (0, 1),
    }
}

/// Get true odds payout ratio for pass/come bets.
fn get_true_odds_payout(point: u8) -> (u64, u64) {
    match point {
        4 | 10 => (TRUE_ODDS_4_10_NUM, TRUE_ODDS_4_10_DEN),
        5 | 9 => (TRUE_ODDS_5_9_NUM, TRUE_ODDS_5_9_DEN),
        6 | 8 => (TRUE_ODDS_6_8_NUM, TRUE_ODDS_6_8_DEN),
        _ => (0, 1),
    }
}

/// Get true odds payout ratio for don't pass/don't come bets (inverse).
fn get_dont_true_odds_payout(point: u8) -> (u64, u64) {
    // Don't bets pay inverse: laying odds.
    match point {
        4 | 10 => (TRUE_ODDS_4_10_DEN, TRUE_ODDS_4_10_NUM), // 1:2
        5 | 9 => (TRUE_ODDS_5_9_DEN, TRUE_ODDS_5_9_NUM),   // 2:3
        6 | 8 => (TRUE_ODDS_6_8_DEN, TRUE_ODDS_6_8_NUM),   // 5:6
        _ => (0, 1),
    }
}
