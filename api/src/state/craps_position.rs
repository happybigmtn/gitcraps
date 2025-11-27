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
            + self.twelve;

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
        self.hardways = [0; NUM_HARDWAYS];
        self.clear_single_roll_bets();
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

account!(OreAccount, CrapsPosition);
