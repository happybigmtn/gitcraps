use serde::{Deserialize, Serialize};
use steel::*;

use crate::state::craps_position_pda;

use super::OreAccount;

/// Number of point numbers (4, 5, 6, 8, 9, 10).
pub const NUM_POINTS: usize = 6;

/// Number of hardway bets (hard 4, 6, 8, 10).
pub const NUM_HARDWAYS: usize = 4;

/// CrapsPosition tracks a user's craps bets for the current epoch.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable, Serialize, Deserialize)]
pub struct CrapsPosition {
    /// The authority (owner) of this craps position.
    pub authority: Pubkey,

    /// The epoch ID these bets are for.
    pub epoch_id: u64,

    // ==================== LINE BETS ====================
    // These persist across rounds within an epoch.

    /// Pass Line bet amount.
    pub pass_line: u64,

    /// Don't Pass bet amount.
    pub dont_pass: u64,

    /// Pass Line odds bet (only valid after point established).
    pub pass_odds: u64,

    /// Don't Pass odds bet (only valid after point established).
    pub dont_pass_odds: u64,

    // ==================== COME BETS ====================
    // Can have up to 6 come bets on different points.
    // Index: 0=4, 1=5, 2=6, 3=8, 4=9, 5=10

    /// Come bet amounts on each point.
    pub come_bets: [u64; NUM_POINTS],

    /// Come odds amounts on each point.
    pub come_odds: [u64; NUM_POINTS],

    /// Don't Come bet amounts on each point.
    pub dont_come_bets: [u64; NUM_POINTS],

    /// Don't Come odds amounts on each point.
    pub dont_come_odds: [u64; NUM_POINTS],

    // ==================== PLACE BETS ====================
    // Can be turned on/off. Index: 0=4, 1=5, 2=6, 3=8, 4=9, 5=10

    /// Place bet amounts.
    pub place_bets: [u64; NUM_POINTS],

    /// Whether place bets are working (on).
    pub place_working: u8, // 0 = off, 1 = on

    /// Padding for alignment.
    pub _padding1: [u8; 7],

    // ==================== YES BETS (TRUE ODDS) ====================
    // "Yes" bets - chosen sum hits before 7, pays at true odds (0% house edge).
    // Index: 0=sum2, 1=sum3, ..., 10=sum12 (7 is invalid, always 0)

    /// Yes bet amounts for each sum 2-12.
    pub yes_bets: [u64; 11],

    // ==================== NO BETS (INVERSE TRUE ODDS) ====================
    // "No" bets - 7 hits before chosen sum, pays inverse true odds.
    // Index: 0=sum2, 1=sum3, ..., 10=sum12 (7 is invalid, always 0)

    /// No bet amounts for each sum 2-12.
    pub no_bets: [u64; 11],

    // ==================== NEXT BETS (SINGLE-ROLL TRUE ODDS) ====================
    // "Next" bets - bet on specific dice sum for next roll, pays true odds.
    // Index: 0=sum2, 1=sum3, ..., 10=sum12

    /// Next bet amounts for each possible sum (2-12).
    pub next_bets: [u64; 11],

    // ==================== HARDWAYS ====================
    // Lose on 7 or easy way. Index: 0=hard4, 1=hard6, 2=hard8, 3=hard10

    /// Hardway bet amounts.
    pub hardways: [u64; NUM_HARDWAYS],

    // ==================== SINGLE-ROLL BETS ====================
    // These are resolved after each roll.

    /// Field bet (wins on 2,3,4,9,10,11,12).
    pub field_bet: u64,

    /// Any Seven bet (wins on any 7).
    pub any_seven: u64,

    /// Any Craps bet (wins on 2, 3, or 12).
    pub any_craps: u64,

    /// Yo Eleven bet (wins on 11).
    pub yo_eleven: u64,

    /// Aces bet (wins on 2).
    pub aces: u64,

    /// Twelve bet (wins on 12).
    pub twelve: u64,

    // ==================== BONUS CRAPS SIDE BETS ====================
    // These bets win if all required totals are hit before a 7.

    /// Small bet amount - wins if 2,3,4,5,6 all hit before 7.
    pub bonus_small: u64,

    /// Tall bet amount - wins if 8,9,10,11,12 all hit before 7.
    pub bonus_tall: u64,

    /// All bet amount - wins if all 2-6 and 8-12 hit before 7.
    pub bonus_all: u64,

    /// Bitmask tracking which Small totals have been hit.
    /// Bit 0 = 2, Bit 1 = 3, Bit 2 = 4, Bit 3 = 5, Bit 4 = 6.
    pub small_hits: u8,

    /// Bitmask tracking which Tall totals have been hit.
    /// Bit 0 = 8, Bit 1 = 9, Bit 2 = 10, Bit 3 = 11, Bit 4 = 12.
    pub tall_hits: u8,

    /// Padding for alignment.
    pub _padding2: [u8; 6],

    // ==================== COME-OUT ONLY SIDE BETS ====================
    // These bets can only be placed on come-out roll and persist until seven-out.

    /// Fire Bet - wins based on unique points made (4+ required).
    pub fire_bet: u64,

    /// Fire Bet tracking: bitmask of unique points made.
    /// Bit 0=4, 1=5, 2=6, 3=8, 4=9, 5=10.
    pub fire_points_made: u8,

    /// Padding for u64 alignment after fire_points_made.
    pub _pad_fire: [u8; 7],

    /// Different Doubles bet.
    pub diff_doubles_bet: u64,

    /// Different Doubles tracking: bitmask of unique doubles rolled.
    /// Bit 0=1-1, 1=2-2, 2=3-3, 3=4-4, 4=5-5, 5=6-6.
    pub diff_doubles_hits: u8,

    /// Padding for u64 alignment after diff_doubles_hits.
    pub _pad_diff: [u8; 7],

    /// Ride the Line bet - wins based on pass line wins before seven-out.
    pub ride_the_line_bet: u64,

    /// Ride the Line tracking: count of pass line wins this shooter.
    pub ride_wins_count: u8,

    /// Padding for u64 alignment after ride_wins_count.
    pub _pad_ride: [u8; 7],

    /// Mugsy's Corner bet - wins on 7 (different payouts based on phase).
    pub mugsy_bet: u64,

    /// Mugsy's Corner tracking: 0=come-out, 1=point phase, 2=resolved.
    pub mugsy_state: u8,

    /// Padding for u64 alignment after mugsy_state.
    pub _pad_mugsy: [u8; 7],

    /// Hot Hand bet - must hit all 10 totals (2-6, 8-12) before 7.
    pub hot_hand_bet: u64,

    /// Hot Hand tracking: bitmask of totals hit (same as small_hits | tall_hits).
    /// Bit 0-4 = 2,3,4,5,6 | Bit 5-9 = 8,9,10,11,12.
    pub hot_hand_hits: u16,

    /// Padding for u64 alignment after hot_hand_hits.
    pub _pad_hot: [u8; 6],

    /// Replay bet - wins when same point is made multiple times.
    pub replay_bet: u64,

    /// Replay tracking: count of times each point was made.
    /// Index: 0=4, 1=5, 2=6, 3=8, 4=9, 5=10.
    pub replay_counts: [u8; NUM_POINTS],

    /// Padding for u64 alignment after replay_counts.
    pub _pad_replay: [u8; 2],

    /// Fielder's Choice bets (3 single-roll bets).
    /// [0] = 2,3,4 | [1] = 4,9,10 | [2] = 10,11,12
    pub fielders_choice: [u64; 3],

    // ==================== TRACKING ====================

    /// Pending winnings to claim.
    pub pending_winnings: u64,

    /// Total amount wagered in this epoch.
    pub total_wagered: u64,

    /// Total winnings in this epoch.
    pub total_won: u64,

    /// Total lost in this epoch.
    pub total_lost: u64,

    /// Last round this position was updated.
    pub last_updated_round: u64,

    // ==================== SECURITY FIX 2.2: DEBT TRACKING ====================
    /// Unpaid debt owed to this user when house was insolvent during settlement.
    /// This allows settlement to complete even when house can't pay, avoiding stuck state.
    /// User can claim this debt later when house is funded.
    pub unpaid_debt: u64,
}

impl CrapsPosition {
    pub fn pda(authority: Pubkey) -> (Pubkey, u8) {
        craps_position_pda(authority)
    }

    /// Check if place bets are working.
    pub fn are_place_bets_working(&self) -> bool {
        self.place_working == 1
    }

    /// Set place bets working status.
    pub fn set_place_working(&mut self, working: bool) {
        self.place_working = if working { 1 } else { 0 };
    }

    /// Get total active bets.
    pub fn total_active_bets(&self) -> u64 {
        let mut total = self.pass_line
            + self.dont_pass
            + self.pass_odds
            + self.dont_pass_odds
            + self.field_bet
            + self.any_seven
            + self.any_craps
            + self.yo_eleven
            + self.aces
            + self.twelve
            + self.bonus_small
            + self.bonus_tall
            + self.bonus_all
            + self.fire_bet
            + self.diff_doubles_bet
            + self.ride_the_line_bet
            + self.mugsy_bet
            + self.hot_hand_bet
            + self.replay_bet
            + self.fielders_choice[0]
            + self.fielders_choice[1]
            + self.fielders_choice[2];

        for i in 0..NUM_POINTS {
            total += self.come_bets[i]
                + self.come_odds[i]
                + self.dont_come_bets[i]
                + self.dont_come_odds[i]
                + self.place_bets[i];
        }

        for i in 0..NUM_HARDWAYS {
            total += self.hardways[i];
        }

        // Yes/No/Next bets (11 elements each for sums 2-12)
        for i in 0..11 {
            total += self.yes_bets[i] + self.no_bets[i] + self.next_bets[i];
        }

        total
    }

    /// Clear single-roll bets.
    pub fn clear_single_roll_bets(&mut self) {
        self.field_bet = 0;
        self.any_seven = 0;
        self.any_craps = 0;
        self.yo_eleven = 0;
        self.aces = 0;
        self.twelve = 0;
        self.fielders_choice = [0; 3];
        self.next_bets = [0; 11];
    }

    /// Clear all bets (for new epoch).
    pub fn clear_all_bets(&mut self) {
        self.pass_line = 0;
        self.dont_pass = 0;
        self.pass_odds = 0;
        self.dont_pass_odds = 0;
        self.come_bets = [0; NUM_POINTS];
        self.come_odds = [0; NUM_POINTS];
        self.dont_come_bets = [0; NUM_POINTS];
        self.dont_come_odds = [0; NUM_POINTS];
        self.place_bets = [0; NUM_POINTS];
        self.yes_bets = [0; 11];
        self.no_bets = [0; 11];
        self.hardways = [0; NUM_HARDWAYS];
        self.clear_single_roll_bets();
        self.clear_bonus_bets();
        self.clear_shooter_bets();
    }

    /// Clear bonus craps bets and reset hit tracking.
    pub fn clear_bonus_bets(&mut self) {
        self.bonus_small = 0;
        self.bonus_tall = 0;
        self.bonus_all = 0;
        self.small_hits = 0;
        self.tall_hits = 0;
    }

    /// Record a dice total for bonus craps tracking.
    /// Returns (small_complete, tall_complete) indicating if either bet just won.
    pub fn record_bonus_hit(&mut self, total: u8) -> (bool, bool) {
        let mut small_just_completed = false;
        let mut tall_just_completed = false;

        // Small tracks totals 2-6 (bits 0-4 map to totals 2-6)
        if total >= 2 && total <= 6 {
            let bit = total - 2; // 2->0, 3->1, 4->2, 5->3, 6->4
            let was_complete = self.small_hits == 0b11111;
            self.small_hits |= 1 << bit;
            small_just_completed = !was_complete && self.small_hits == 0b11111;
        }

        // Tall tracks totals 8-12 (bits 0-4 map to totals 8-12)
        if total >= 8 && total <= 12 {
            let bit = total - 8; // 8->0, 9->1, 10->2, 11->3, 12->4
            let was_complete = self.tall_hits == 0b11111;
            self.tall_hits |= 1 << bit;
            tall_just_completed = !was_complete && self.tall_hits == 0b11111;
        }

        (small_just_completed, tall_just_completed)
    }

    /// Check if Small bet is complete (all 2,3,4,5,6 hit).
    pub fn is_small_complete(&self) -> bool {
        self.small_hits == 0b11111
    }

    /// Check if Tall bet is complete (all 8,9,10,11,12 hit).
    pub fn is_tall_complete(&self) -> bool {
        self.tall_hits == 0b11111
    }

    /// Check if All bet is complete (both Small and Tall complete).
    pub fn is_all_complete(&self) -> bool {
        self.is_small_complete() && self.is_tall_complete()
    }

    /// Check if player has any active bonus bets.
    pub fn has_bonus_bets(&self) -> bool {
        self.bonus_small > 0 || self.bonus_tall > 0 || self.bonus_all > 0
    }

    /// Clear come-out only side bets and their tracking (called on seven-out).
    pub fn clear_shooter_bets(&mut self) {
        self.fire_bet = 0;
        self.fire_points_made = 0;
        self.diff_doubles_bet = 0;
        self.diff_doubles_hits = 0;
        self.ride_the_line_bet = 0;
        self.ride_wins_count = 0;
        self.mugsy_bet = 0;
        self.mugsy_state = 0;
        self.hot_hand_bet = 0;
        self.hot_hand_hits = 0;
        self.replay_bet = 0;
        self.replay_counts = [0; NUM_POINTS];
    }

    /// Check if player has any active shooter bets.
    pub fn has_shooter_bets(&self) -> bool {
        self.fire_bet > 0
            || self.diff_doubles_bet > 0
            || self.ride_the_line_bet > 0
            || self.mugsy_bet > 0
            || self.hot_hand_bet > 0
            || self.replay_bet > 0
    }

    /// Record a point being made for Fire Bet tracking.
    /// Returns the number of unique points made (for payout calculation).
    pub fn record_fire_point(&mut self, point: u8) -> u8 {
        if let Some(idx) = point_to_index(point) {
            self.fire_points_made |= 1 << idx;
        }
        self.fire_points_made.count_ones() as u8
    }

    /// Get number of unique points made for Fire Bet.
    pub fn fire_points_count(&self) -> u8 {
        self.fire_points_made.count_ones() as u8
    }

    /// Record a double roll for Different Doubles tracking.
    /// Returns the number of unique doubles hit (for payout calculation).
    pub fn record_double(&mut self, die_value: u8) -> u8 {
        if die_value >= 1 && die_value <= 6 {
            let bit = die_value - 1; // 1->0, 2->1, etc.
            self.diff_doubles_hits |= 1 << bit;
        }
        self.diff_doubles_hits.count_ones() as u8
    }

    /// Get number of unique doubles hit.
    pub fn diff_doubles_count(&self) -> u8 {
        self.diff_doubles_hits.count_ones() as u8
    }

    /// Record a pass line win for Ride the Line tracking.
    pub fn record_ride_win(&mut self) {
        if self.ride_wins_count < 255 {
            self.ride_wins_count += 1;
        }
    }

    /// Record a dice total for Hot Hand tracking.
    /// Returns true if all 10 totals have now been hit.
    pub fn record_hot_hand_hit(&mut self, total: u8) -> bool {
        // Small totals 2-6 go in bits 0-4
        if total >= 2 && total <= 6 {
            let bit = total - 2; // 2->0, 3->1, 4->2, 5->3, 6->4
            self.hot_hand_hits |= 1 << bit;
        }
        // Tall totals 8-12 go in bits 5-9
        if total >= 8 && total <= 12 {
            let bit = (total - 8) + 5; // 8->5, 9->6, 10->7, 11->8, 12->9
            self.hot_hand_hits |= 1 << bit;
        }
        // All 10 totals hit means bits 0-9 are all set (0x3FF = 1023)
        self.hot_hand_hits == 0x3FF
    }

    /// Get number of unique totals hit for Hot Hand.
    pub fn hot_hand_count(&self) -> u8 {
        self.hot_hand_hits.count_ones() as u8
    }

    /// Check if Hot Hand bet is complete (all 10 totals hit).
    pub fn is_hot_hand_complete(&self) -> bool {
        self.hot_hand_hits == 0x3FF
    }

    /// Record a point being made for Replay Bet tracking.
    /// Returns the count for that point after incrementing.
    pub fn record_replay_point(&mut self, point: u8) -> u8 {
        if let Some(idx) = point_to_index(point) {
            if self.replay_counts[idx] < 255 {
                self.replay_counts[idx] += 1;
            }
            self.replay_counts[idx]
        } else {
            0
        }
    }

    /// Get max replay count for any point.
    pub fn max_replay_count(&self) -> u8 {
        *self.replay_counts.iter().max().unwrap_or(&0)
    }

    /// Set Mugsy state to point phase.
    pub fn set_mugsy_point_phase(&mut self) {
        if self.mugsy_state == 0 {
            self.mugsy_state = 1;
        }
    }

    /// Check if Mugsy bet is in come-out phase.
    pub fn is_mugsy_comeout(&self) -> bool {
        self.mugsy_state == 0
    }

    /// Check if Mugsy bet is in point phase.
    pub fn is_mugsy_point_phase(&self) -> bool {
        self.mugsy_state == 1
    }

    /// Reset for new epoch.
    pub fn reset_for_epoch(&mut self, epoch_id: u64) {
        self.epoch_id = epoch_id;
        self.clear_all_bets();
        self.total_wagered = 0;
        self.total_won = 0;
        self.total_lost = 0;
    }
}

/// Helper: Convert point number (4,5,6,8,9,10) to array index (0-5).
pub fn point_to_index(point: u8) -> Option<usize> {
    match point {
        4 => Some(0),
        5 => Some(1),
        6 => Some(2),
        8 => Some(3),
        9 => Some(4),
        10 => Some(5),
        _ => None,
    }
}

/// Helper: Convert array index (0-5) to point number (4,5,6,8,9,10).
pub fn index_to_point(index: usize) -> Option<u8> {
    match index {
        0 => Some(4),
        1 => Some(5),
        2 => Some(6),
        3 => Some(8),
        4 => Some(9),
        5 => Some(10),
        _ => None,
    }
}

/// Helper: Convert hardway (4,6,8,10) to array index (0-3).
pub fn hardway_to_index(hardway: u8) -> Option<usize> {
    match hardway {
        4 => Some(0),
        6 => Some(1),
        8 => Some(2),
        10 => Some(3),
        _ => None,
    }
}

/// Helper: Convert dice sum (2-12) to array index (0-10) for Yes/No/Next bets.
pub fn sum_to_index(sum: u8) -> Option<usize> {
    if sum >= 2 && sum <= 12 {
        Some((sum - 2) as usize)
    } else {
        None
    }
}

/// Helper: Convert array index (0-10) to dice sum (2-12).
pub fn index_to_sum(index: usize) -> Option<u8> {
    if index <= 10 {
        Some((index + 2) as u8)
    } else {
        None
    }
}

/// Helper: Check if sum is valid for Yes/No bets (2-12 except 7).
pub fn is_valid_yes_no_sum(sum: u8) -> bool {
    sum >= 2 && sum <= 12 && sum != 7
}

account!(OreAccount, CrapsPosition);
