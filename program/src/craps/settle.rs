use ore_api::prelude::*;
use ore_api::state::{index_to_point, NUM_POINTS, NUM_HARDWAYS};
use solana_program::log::sol_log;
use steel::*;

use super::utils::{
    square_to_dice_sum, square_to_dice, is_hardway, is_craps, is_natural, is_point_number,
    is_field_winner, hardway_loses, calculate_payout,
};

/// SECURITY FIX 3.2: Helper to calculate and release reserved payout for a settled bet.
/// Uses checked_sub to detect accounting errors. If reserved_payouts would go negative,
/// this indicates a critical bug in the reservation system - we log a warning and clamp to 0.
fn release_reserved_payout(craps_game: &mut CrapsGame, bet_amount: u64, payout_num: u64, payout_den: u64) {
    // Calculate the max payout that was reserved (bet + winnings)
    let payout = bet_amount
        .saturating_mul(payout_num)
        .saturating_div(payout_den.max(1)); // Avoid division by zero
    let max_payout = bet_amount.saturating_add(payout);

    // Release the reserved amount with checked_sub to detect accounting errors
    match craps_game.reserved_payouts.checked_sub(max_payout) {
        Some(new_reserved) => {
            craps_game.reserved_payouts = new_reserved;
        }
        None => {
            // This indicates a critical accounting bug - reserved_payouts is less than expected
            // Log warning but don't fail transaction to avoid stuck state
            sol_log("WARNING: reserved_payouts underflow detected - possible accounting bug");
            craps_game.reserved_payouts = 0;
        }
    }
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
    // In localnet/devnet mode, skip RNG validation to allow testing with any winning_square.
    // Devnet's slot_hash returns zeros just like localnet.
    #[cfg(not(any(feature = "localnet", feature = "devnet")))]
    {
        let Some(rng) = round.rng() else {
            sol_log("Round has no valid RNG");
            return Err(ProgramError::InvalidAccountData);
        };
        let actual_winning_square = round.winning_square(rng);
        if actual_winning_square != winning_square {
            sol_log(&format!("Winning square mismatch: expected {}, got {}", actual_winning_square, winning_square).as_str());
            return Err(ProgramError::InvalidArgument);
        }
    }
    #[cfg(any(feature = "localnet", feature = "devnet"))]
    {
        sol_log("TEST MODE: Skipping RNG validation (localnet/devnet)");
        let _ = round; // Suppress unused warning
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
            .checked_add(craps_position.twelve).unwrap_or(0)
            .checked_add(craps_position.bonus_small).unwrap_or(0)
            .checked_add(craps_position.bonus_tall).unwrap_or(0)
            .checked_add(craps_position.bonus_all).unwrap_or(0);

        // Add array bets
        let array_total: u64 = craps_position.come_bets.iter().sum::<u64>()
            + craps_position.come_odds.iter().sum::<u64>()
            + craps_position.dont_come_bets.iter().sum::<u64>()
            + craps_position.dont_come_odds.iter().sum::<u64>()
            + craps_position.place_bets.iter().sum::<u64>()
            + craps_position.yes_bets.iter().sum::<u64>()
            + craps_position.no_bets.iter().sum::<u64>()
            + craps_position.next_bets.iter().sum::<u64>()
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
        craps_position.yes_bets = [0; 11];
        craps_position.no_bets = [0; 11];
        craps_position.next_bets = [0; 11];
        craps_position.hardways = [0; 4];
        craps_position.clear_bonus_bets();

        return Ok(());
    }

    // SECURITY FIX 1.2: Check if already settled for this round.
    // Must use >= to prevent re-settling the same round multiple times.
    // This prevents the attack where a user places a late bet and settles repeatedly.
    // Special case: Allow first settlement when last_updated_round == 0 and round.id == 0
    // (new positions start with last_updated_round = 0, and first round.id is also 0)
    let is_first_settlement = craps_position.last_updated_round == 0 && round.id == 0;
    if !is_first_settlement && craps_position.last_updated_round >= round.id {
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
        || craps_position.bonus_small > 0
        || craps_position.bonus_tall > 0
        || craps_position.bonus_all > 0
        || craps_position.fire_bet > 0
        || craps_position.diff_doubles_bet > 0
        || craps_position.ride_the_line_bet > 0
        || craps_position.mugsy_bet > 0
        || craps_position.hot_hand_bet > 0
        || craps_position.replay_bet > 0
        || craps_position.fielders_choice.iter().any(|&x| x > 0)
        || craps_position.hardways.iter().any(|&x| x > 0)
        || craps_position.place_bets.iter().any(|&x| x > 0)
        || craps_position.yes_bets.iter().any(|&x| x > 0)
        || craps_position.no_bets.iter().any(|&x| x > 0)
        || craps_position.next_bets.iter().any(|&x| x > 0)
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
    let (die1, die2) = square_to_dice(winning_square);

    #[cfg(feature = "debug")]
    sol_log(&format!("Dice: {}+{}={}, is_hard: {}", die1, die2, dice_sum, is_hard).as_str());

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

    // ==================== NEXT BETS (SINGLE-ROLL TRUE ODDS) ====================
    // "Next" bets - win if the specific dice sum is rolled, pays true odds.
    // Index: 0=sum2, 1=sum3, ..., 10=sum12

    for next_idx in 0..11usize {
        let next_sum = (next_idx + 2) as u8; // 0->2, 1->3, ..., 10->12
        if craps_position.next_bets[next_idx] > 0 {
            let (num, den) = get_next_payout(next_sum);

            if dice_sum == next_sum {
                // Next bet won!
                let payout = calculate_payout(craps_position.next_bets[next_idx], num, den);
                let win_amount = craps_position.next_bets[next_idx]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Next {} won: {} + {}", next_sum, craps_position.next_bets[next_idx], payout).as_str());
            } else {
                // Next bet lost (single-roll bet)
                total_lost = total_lost
                    .checked_add(craps_position.next_bets[next_idx])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Next {} lost", next_sum).as_str());
            }
            release_reserved_payout(craps_game, craps_position.next_bets[next_idx], num, den);
            craps_position.next_bets[next_idx] = 0;
        }
    }

    // ==================== BONUS CRAPS SIDE BETS ====================
    // Small: Win if 2,3,4,5,6 all hit before 7. Pays 30:1.
    // Tall: Win if 8,9,10,11,12 all hit before 7. Pays 30:1.
    // All: Win if all Small + Tall totals hit before 7. Pays 150:1.

    if craps_position.has_bonus_bets() {
        if dice_sum == 7 {
            // Seven out - all bonus bets lose
            if craps_position.bonus_small > 0 {
                total_lost = total_lost
                    .checked_add(craps_position.bonus_small)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Bonus Small lost on 7: {}", craps_position.bonus_small).as_str());
                release_reserved_payout(craps_game, craps_position.bonus_small, BONUS_SMALL_PAYOUT_NUM, BONUS_SMALL_PAYOUT_DEN);
            }
            if craps_position.bonus_tall > 0 {
                total_lost = total_lost
                    .checked_add(craps_position.bonus_tall)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Bonus Tall lost on 7: {}", craps_position.bonus_tall).as_str());
                release_reserved_payout(craps_game, craps_position.bonus_tall, BONUS_TALL_PAYOUT_NUM, BONUS_TALL_PAYOUT_DEN);
            }
            if craps_position.bonus_all > 0 {
                total_lost = total_lost
                    .checked_add(craps_position.bonus_all)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Bonus All lost on 7: {}", craps_position.bonus_all).as_str());
                release_reserved_payout(craps_game, craps_position.bonus_all, BONUS_ALL_PAYOUT_NUM, BONUS_ALL_PAYOUT_DEN);
            }
            craps_position.clear_bonus_bets();
        } else {
            // Record this hit and check for wins
            let (small_just_complete, tall_just_complete) = craps_position.record_bonus_hit(dice_sum);

            // Check if Small bet won (all 2,3,4,5,6 have been hit)
            if small_just_complete && craps_position.bonus_small > 0 {
                let payout = calculate_payout(craps_position.bonus_small, BONUS_SMALL_PAYOUT_NUM, BONUS_SMALL_PAYOUT_DEN);
                let win_amount = craps_position.bonus_small
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Bonus Small won! {} + {}", craps_position.bonus_small, payout).as_str());
                release_reserved_payout(craps_game, craps_position.bonus_small, BONUS_SMALL_PAYOUT_NUM, BONUS_SMALL_PAYOUT_DEN);
                craps_position.bonus_small = 0;
            }

            // Check if Tall bet won (all 8,9,10,11,12 have been hit)
            if tall_just_complete && craps_position.bonus_tall > 0 {
                let payout = calculate_payout(craps_position.bonus_tall, BONUS_TALL_PAYOUT_NUM, BONUS_TALL_PAYOUT_DEN);
                let win_amount = craps_position.bonus_tall
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Bonus Tall won! {} + {}", craps_position.bonus_tall, payout).as_str());
                release_reserved_payout(craps_game, craps_position.bonus_tall, BONUS_TALL_PAYOUT_NUM, BONUS_TALL_PAYOUT_DEN);
                craps_position.bonus_tall = 0;
            }

            // Check if All bet won (both Small and Tall complete)
            if craps_position.is_all_complete() && craps_position.bonus_all > 0 {
                let payout = calculate_payout(craps_position.bonus_all, BONUS_ALL_PAYOUT_NUM, BONUS_ALL_PAYOUT_DEN);
                let win_amount = craps_position.bonus_all
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Bonus All won! {} + {}", craps_position.bonus_all, payout).as_str());
                release_reserved_payout(craps_game, craps_position.bonus_all, BONUS_ALL_PAYOUT_NUM, BONUS_ALL_PAYOUT_DEN);
                craps_position.bonus_all = 0;
            }
        }
    }

    // ==================== FIELDER'S CHOICE (Single-Roll) ====================
    // [0] = 2,3,4 pays 4:1 | [1] = 4,9,10 pays 2:1 | [2] = 10,11,12 pays 4:1
    for i in 0..3 {
        if craps_position.fielders_choice[i] > 0 {
            let wins = match i {
                0 => dice_sum == 2 || dice_sum == 3 || dice_sum == 4,
                1 => dice_sum == 4 || dice_sum == 9 || dice_sum == 10,
                2 => dice_sum == 10 || dice_sum == 11 || dice_sum == 12,
                _ => false,
            };
            let (num, den) = match i {
                0 => (FIELDERS_1_PAYOUT_NUM, FIELDERS_1_PAYOUT_DEN),
                1 => (FIELDERS_2_PAYOUT_NUM, FIELDERS_2_PAYOUT_DEN),
                2 => (FIELDERS_3_PAYOUT_NUM, FIELDERS_3_PAYOUT_DEN),
                _ => (0, 1),
            };

            if wins {
                let payout = calculate_payout(craps_position.fielders_choice[i], num, den);
                let win_amount = craps_position.fielders_choice[i]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Fielder's Choice {} won: {} + {}", i, craps_position.fielders_choice[i], payout).as_str());
            } else {
                total_lost = total_lost
                    .checked_add(craps_position.fielders_choice[i])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
            }
            release_reserved_payout(craps_game, craps_position.fielders_choice[i], num, den);
            craps_position.fielders_choice[i] = 0;
        }
    }

    // ==================== DIFFERENT DOUBLES ====================
    // Track unique doubles rolled. Win on 3+ unique doubles before 7.
    // Loses on 7. Payouts: 3=4:1, 4=8:1, 5=15:1, 6=100:1.
    if craps_position.diff_doubles_bet > 0 {
        if dice_sum == 7 {
            // Check for payout before losing
            let count = craps_position.diff_doubles_count();
            if count >= 3 {
                let (num, den) = get_diff_doubles_payout(count);
                let payout = calculate_payout(craps_position.diff_doubles_bet, num, den);
                let win_amount = craps_position.diff_doubles_bet
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Different Doubles {} won on 7: {} + {}", count, craps_position.diff_doubles_bet, payout).as_str());
            } else {
                total_lost = total_lost
                    .checked_add(craps_position.diff_doubles_bet)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Different Doubles lost on 7 with only {} doubles", count).as_str());
            }
            release_reserved_payout(craps_game, craps_position.diff_doubles_bet, DIFF_DOUBLES_6_PAYOUT_NUM, DIFF_DOUBLES_6_PAYOUT_DEN);
            craps_position.diff_doubles_bet = 0;
            craps_position.diff_doubles_hits = 0;
        } else if die1 == die2 {
            // Record the double
            let count = craps_position.record_double(die1);
            #[cfg(feature = "debug")]
            sol_log(&format!("Different Doubles: recorded {}-{}, now {} unique", die1, die2, count).as_str());
            // Check for all 6 doubles - auto win
            if count == 6 {
                let payout = calculate_payout(craps_position.diff_doubles_bet, DIFF_DOUBLES_6_PAYOUT_NUM, DIFF_DOUBLES_6_PAYOUT_DEN);
                let win_amount = craps_position.diff_doubles_bet
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Different Doubles 6 won! {} + {}", craps_position.diff_doubles_bet, payout).as_str());
                release_reserved_payout(craps_game, craps_position.diff_doubles_bet, DIFF_DOUBLES_6_PAYOUT_NUM, DIFF_DOUBLES_6_PAYOUT_DEN);
                craps_position.diff_doubles_bet = 0;
                craps_position.diff_doubles_hits = 0;
            }
        }
    }

    // ==================== HOT HAND ====================
    // Must hit all 10 totals (2-6, 8-12) before 7. Loses on 7.
    // Payouts: 9 totals = 20:1, 10 totals = 80:1.
    if craps_position.hot_hand_bet > 0 {
        if dice_sum == 7 {
            // Check for partial payout (9 totals)
            let count = craps_position.hot_hand_count();
            if count >= 9 {
                let (num, den) = if count >= 10 {
                    (HOT_HAND_10_PAYOUT_NUM, HOT_HAND_10_PAYOUT_DEN)
                } else {
                    (HOT_HAND_9_PAYOUT_NUM, HOT_HAND_9_PAYOUT_DEN)
                };
                let payout = calculate_payout(craps_position.hot_hand_bet, num, den);
                let win_amount = craps_position.hot_hand_bet
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Hot Hand {} won on 7: {} + {}", count, craps_position.hot_hand_bet, payout).as_str());
            } else {
                total_lost = total_lost
                    .checked_add(craps_position.hot_hand_bet)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Hot Hand lost on 7 with only {} totals", count).as_str());
            }
            release_reserved_payout(craps_game, craps_position.hot_hand_bet, HOT_HAND_10_PAYOUT_NUM, HOT_HAND_10_PAYOUT_DEN);
            craps_position.hot_hand_bet = 0;
            craps_position.hot_hand_hits = 0;
        } else {
            // Record the total hit
            let complete = craps_position.record_hot_hand_hit(dice_sum);
            if complete {
                let payout = calculate_payout(craps_position.hot_hand_bet, HOT_HAND_10_PAYOUT_NUM, HOT_HAND_10_PAYOUT_DEN);
                let win_amount = craps_position.hot_hand_bet
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Hot Hand complete! {} + {}", craps_position.hot_hand_bet, payout).as_str());
                release_reserved_payout(craps_game, craps_position.hot_hand_bet, HOT_HAND_10_PAYOUT_NUM, HOT_HAND_10_PAYOUT_DEN);
                craps_position.hot_hand_bet = 0;
                craps_position.hot_hand_hits = 0;
            }
        }
    }

    // ==================== MUGSY'S CORNER ====================
    // Wins on 7. Come-out 7 = 2:1, Point phase 7 = 3:1.
    if craps_position.mugsy_bet > 0 {
        if dice_sum == 7 {
            let (num, den) = if craps_position.is_mugsy_comeout() {
                (MUGSY_COMEOUT_7_PAYOUT_NUM, MUGSY_COMEOUT_7_PAYOUT_DEN)
            } else {
                (MUGSY_POINT_7_PAYOUT_NUM, MUGSY_POINT_7_PAYOUT_DEN)
            };
            let payout = calculate_payout(craps_position.mugsy_bet, num, den);
            let win_amount = craps_position.mugsy_bet
                .checked_add(payout)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            total_winnings = total_winnings
                .checked_add(win_amount)
                .ok_or(ProgramError::ArithmeticOverflow)?;
            #[cfg(feature = "debug")]
            sol_log(&format!("Mugsy's Corner won on 7: {} + {}", craps_position.mugsy_bet, payout).as_str());
            release_reserved_payout(craps_game, craps_position.mugsy_bet, MUGSY_POINT_7_PAYOUT_NUM, MUGSY_POINT_7_PAYOUT_DEN);
            craps_position.mugsy_bet = 0;
            craps_position.mugsy_state = 0;
        }
        // Note: Mugsy state transitions happen in the LINE BETS section when point is established
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

    // ==================== YES BETS (TRUE ODDS) ====================
    // Win if chosen sum hits before 7, pays true odds.
    // Index: 0=sum2, 1=sum3, ..., 10=sum12 (7 is invalid, always 0)

    for i in 0..11usize {
        let bet_sum = (i + 2) as u8; // 0->2, 1->3, ..., 10->12
        // Skip sum 7 (index 5) as it's invalid for Yes bets
        if bet_sum == 7 {
            continue;
        }
        if craps_position.yes_bets[i] > 0 {
            let (num, den) = get_yes_payout(bet_sum);

            if dice_sum == bet_sum {
                // Yes bet won!
                let payout = calculate_payout(craps_position.yes_bets[i], num, den);
                let win_amount = craps_position.yes_bets[i]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Yes {} won: {} + {}", bet_sum, craps_position.yes_bets[i], payout).as_str());
                release_reserved_payout(craps_game, craps_position.yes_bets[i], num, den);
                craps_position.yes_bets[i] = 0;
            } else if dice_sum == 7 {
                // Yes bet lost on 7.
                total_lost = total_lost
                    .checked_add(craps_position.yes_bets[i])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("Yes {} lost on 7", bet_sum).as_str());
                release_reserved_payout(craps_game, craps_position.yes_bets[i], num, den);
                craps_position.yes_bets[i] = 0;
            }
        }
    }

    // ==================== NO BETS (INVERSE TRUE ODDS) ====================
    // Win if 7 hits before chosen sum, pays inverse true odds.
    // Index: 0=sum2, 1=sum3, ..., 10=sum12 (7 is invalid, always 0)

    for i in 0..11usize {
        let bet_sum = (i + 2) as u8; // 0->2, 1->3, ..., 10->12
        // Skip sum 7 (index 5) as it's invalid for No bets
        if bet_sum == 7 {
            continue;
        }
        if craps_position.no_bets[i] > 0 {
            let (num, den) = get_no_payout(bet_sum);

            if dice_sum == 7 {
                // No bet won! (7 came before sum)
                let payout = calculate_payout(craps_position.no_bets[i], num, den);
                let win_amount = craps_position.no_bets[i]
                    .checked_add(payout)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                total_winnings = total_winnings
                    .checked_add(win_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("No {} won on 7: {} + {}", bet_sum, craps_position.no_bets[i], payout).as_str());
                release_reserved_payout(craps_game, craps_position.no_bets[i], num, den);
                craps_position.no_bets[i] = 0;
            } else if dice_sum == bet_sum {
                // No bet lost (sum hit before 7).
                total_lost = total_lost
                    .checked_add(craps_position.no_bets[i])
                    .ok_or(ProgramError::ArithmeticOverflow)?;
                #[cfg(feature = "debug")]
                sol_log(&format!("No {} lost on sum", bet_sum).as_str());
                release_reserved_payout(craps_game, craps_position.no_bets[i], num, den);
                craps_position.no_bets[i] = 0;
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

            // Update Mugsy state to point phase.
            if craps_position.mugsy_bet > 0 {
                craps_position.set_mugsy_point_phase();
            }
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

            // ========== FIRE BET: Record point made ==========
            if craps_position.fire_bet > 0 {
                let fire_count = craps_position.record_fire_point(point);
                #[cfg(feature = "debug")]
                sol_log(&format!("Fire Bet: point {} made, now {} unique points", point, fire_count).as_str());
            }

            // ========== REPLAY BET: Record point made ==========
            if craps_position.replay_bet > 0 {
                let replay_count = craps_position.record_replay_point(point);
                #[cfg(feature = "debug")]
                sol_log(&format!("Replay Bet: point {} made {} times", point, replay_count).as_str());
            }

            // ========== RIDE THE LINE: Record pass line win ==========
            if craps_position.ride_the_line_bet > 0 {
                craps_position.record_ride_win();
                #[cfg(feature = "debug")]
                sol_log(&format!("Ride the Line: {} wins", craps_position.ride_wins_count).as_str());
            }

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

            // ========== FIRE BET: Settle on seven-out ==========
            if craps_position.fire_bet > 0 {
                let fire_count = craps_position.fire_points_count();
                if fire_count >= 4 {
                    let (num, den) = get_fire_bet_payout(fire_count);
                    let payout = calculate_payout(craps_position.fire_bet, num, den);
                    let win_amount = craps_position.fire_bet
                        .checked_add(payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Fire Bet {} points won: {} + {}", fire_count, craps_position.fire_bet, payout).as_str());
                } else {
                    total_lost = total_lost
                        .checked_add(craps_position.fire_bet)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Fire Bet lost with only {} points", fire_count).as_str());
                }
                release_reserved_payout(craps_game, craps_position.fire_bet, FIRE_6_POINTS_PAYOUT_NUM, FIRE_6_POINTS_PAYOUT_DEN);
            }

            // ========== RIDE THE LINE: Settle on seven-out ==========
            if craps_position.ride_the_line_bet > 0 {
                let wins = craps_position.ride_wins_count;
                if wins >= 3 {
                    let (num, den) = get_ride_the_line_payout(wins);
                    let payout = calculate_payout(craps_position.ride_the_line_bet, num, den);
                    let win_amount = craps_position.ride_the_line_bet
                        .checked_add(payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Ride the Line {} wins won: {} + {}", wins, craps_position.ride_the_line_bet, payout).as_str());
                } else {
                    total_lost = total_lost
                        .checked_add(craps_position.ride_the_line_bet)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Ride the Line lost with only {} wins", wins).as_str());
                }
                release_reserved_payout(craps_game, craps_position.ride_the_line_bet, RIDE_11_WINS_PAYOUT_NUM, RIDE_11_WINS_PAYOUT_DEN);
            }

            // ========== REPLAY BET: Settle on seven-out ==========
            if craps_position.replay_bet > 0 {
                let max_count = craps_position.max_replay_count();
                if max_count >= 3 {
                    // Find which point had the max count and calculate payout
                    let (num, den) = get_replay_bet_payout(&craps_position.replay_counts);
                    let payout = calculate_payout(craps_position.replay_bet, num, den);
                    let win_amount = craps_position.replay_bet
                        .checked_add(payout)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    total_winnings = total_winnings
                        .checked_add(win_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Replay Bet won with max {} repeats: {} + {}", max_count, craps_position.replay_bet, payout).as_str());
                } else {
                    total_lost = total_lost
                        .checked_add(craps_position.replay_bet)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                    #[cfg(feature = "debug")]
                    sol_log(&format!("Replay Bet lost with max {} repeats", max_count).as_str());
                }
                release_reserved_payout(craps_game, craps_position.replay_bet, REPLAY_4_10_4X_PAYOUT_NUM, REPLAY_4_10_4X_PAYOUT_DEN);
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

    // SECURITY FIX 2.2: Handle insolvency with debt tracking instead of failing
    // House bankroll is reduced by net winnings.
    if total_winnings > total_lost {
        let net_payout = total_winnings
            .checked_sub(total_lost)
            .ok_or(ProgramError::ArithmeticOverflow)?;

        if net_payout > 0 {
            if craps_game.house_bankroll >= net_payout {
                // House can pay - process normally
                craps_game.house_bankroll = craps_game.house_bankroll
                    .checked_sub(net_payout)
                    .ok_or(ProgramError::InsufficientFunds)?;
            } else {
                // SECURITY FIX 2.2: House is insolvent - track debt instead of failing
                // This prevents user accounts from being stuck in a winning state they cannot exit
                let payable_amount = craps_game.house_bankroll;
                let debt_amount = net_payout
                    .checked_sub(payable_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;

                // Pay what we can
                craps_game.house_bankroll = 0;

                // Track the remaining debt owed to user
                craps_position.unpaid_debt = craps_position.unpaid_debt
                    .checked_add(debt_amount)
                    .ok_or(ProgramError::ArithmeticOverflow)?;

                // Adjust pending_winnings to reflect only what can be paid now
                // (unpaid portion is tracked separately in unpaid_debt)
                if craps_position.pending_winnings >= debt_amount {
                    craps_position.pending_winnings = craps_position.pending_winnings
                        .checked_sub(debt_amount)
                        .ok_or(ProgramError::ArithmeticOverflow)?;
                }

                sol_log(&format!(
                    "WARNING: House insolvent. Paid: {}, Debt recorded: {}",
                    payable_amount, debt_amount
                ).as_str());
            }
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

/// Get Different Doubles payout based on count.
fn get_diff_doubles_payout(count: u8) -> (u64, u64) {
    match count {
        3 => (DIFF_DOUBLES_3_PAYOUT_NUM, DIFF_DOUBLES_3_PAYOUT_DEN),
        4 => (DIFF_DOUBLES_4_PAYOUT_NUM, DIFF_DOUBLES_4_PAYOUT_DEN),
        5 => (DIFF_DOUBLES_5_PAYOUT_NUM, DIFF_DOUBLES_5_PAYOUT_DEN),
        6 => (DIFF_DOUBLES_6_PAYOUT_NUM, DIFF_DOUBLES_6_PAYOUT_DEN),
        _ => (0, 1),
    }
}

/// Get Fire Bet payout based on points made.
fn get_fire_bet_payout(points: u8) -> (u64, u64) {
    match points {
        4 => (FIRE_4_POINTS_PAYOUT_NUM, FIRE_4_POINTS_PAYOUT_DEN),
        5 => (FIRE_5_POINTS_PAYOUT_NUM, FIRE_5_POINTS_PAYOUT_DEN),
        6 => (FIRE_6_POINTS_PAYOUT_NUM, FIRE_6_POINTS_PAYOUT_DEN),
        _ => (0, 1),
    }
}

/// Get Ride the Line payout based on wins.
fn get_ride_the_line_payout(wins: u8) -> (u64, u64) {
    match wins {
        3 => (RIDE_3_WINS_PAYOUT_NUM, RIDE_3_WINS_PAYOUT_DEN),
        4 => (RIDE_4_WINS_PAYOUT_NUM, RIDE_4_WINS_PAYOUT_DEN),
        5 => (RIDE_5_WINS_PAYOUT_NUM, RIDE_5_WINS_PAYOUT_DEN),
        6 => (RIDE_6_WINS_PAYOUT_NUM, RIDE_6_WINS_PAYOUT_DEN),
        7 => (RIDE_7_WINS_PAYOUT_NUM, RIDE_7_WINS_PAYOUT_DEN),
        8 => (RIDE_8_WINS_PAYOUT_NUM, RIDE_8_WINS_PAYOUT_DEN),
        9 => (RIDE_9_WINS_PAYOUT_NUM, RIDE_9_WINS_PAYOUT_DEN),
        10 => (RIDE_10_WINS_PAYOUT_NUM, RIDE_10_WINS_PAYOUT_DEN),
        _ if wins >= 11 => (RIDE_11_WINS_PAYOUT_NUM, RIDE_11_WINS_PAYOUT_DEN),
        _ => (0, 1),
    }
}

/// Get Replay Bet payout. Finds the best payout from the replay counts.
/// Index: 0=4, 1=5, 2=6, 3=8, 4=9, 5=10
fn get_replay_bet_payout(counts: &[u8; 6]) -> (u64, u64) {
    let mut best_payout = (0u64, 1u64);

    for (idx, &count) in counts.iter().enumerate() {
        if count < 3 {
            continue;
        }

        let payout = match idx {
            // 4 or 10 (indices 0 and 5)
            0 | 5 => {
                if count >= 4 {
                    (REPLAY_4_10_4X_PAYOUT_NUM, REPLAY_4_10_4X_PAYOUT_DEN)
                } else {
                    (REPLAY_4_10_3X_PAYOUT_NUM, REPLAY_4_10_3X_PAYOUT_DEN)
                }
            }
            // 5 or 9 (indices 1 and 4)
            1 | 4 => {
                if count >= 4 {
                    (REPLAY_5_9_4X_PAYOUT_NUM, REPLAY_5_9_4X_PAYOUT_DEN)
                } else {
                    (REPLAY_5_9_3X_PAYOUT_NUM, REPLAY_5_9_3X_PAYOUT_DEN)
                }
            }
            // 6 or 8 (indices 2 and 3)
            2 | 3 => {
                if count >= 4 {
                    (REPLAY_6_8_4X_PAYOUT_NUM, REPLAY_6_8_4X_PAYOUT_DEN)
                } else {
                    (REPLAY_6_8_3X_PAYOUT_NUM, REPLAY_6_8_3X_PAYOUT_DEN)
                }
            }
            _ => (0, 1),
        };

        // Keep the best payout (highest ratio)
        if payout.0 * best_payout.1 > best_payout.0 * payout.1 {
            best_payout = payout;
        }
    }

    best_payout
}

/// Get Next bet payout ratio (true odds for single-roll bets).
fn get_next_payout(sum: u8) -> (u64, u64) {
    match sum {
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
        _ => (0, 1),
    }
}

/// Get Yes bet payout ratio (true odds - sum before 7).
fn get_yes_payout(sum: u8) -> (u64, u64) {
    match sum {
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
        _ => (0, 1), // 7 is invalid for Yes bets
    }
}

/// Get No bet payout ratio (inverse true odds - 7 before sum).
fn get_no_payout(sum: u8) -> (u64, u64) {
    match sum {
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
        _ => (0, 1), // 7 is invalid for No bets
    }
}
