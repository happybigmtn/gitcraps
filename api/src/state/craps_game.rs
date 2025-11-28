use serde::{Deserialize, Serialize};
use steel::*;

use crate::state::craps_game_pda;

use super::OreAccount;

/// CrapsGame is a singleton account that tracks the global craps game state.
/// It maintains epoch information and the current point for line bets.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable, Serialize, Deserialize)]
pub struct CrapsGame {
    /// The current epoch number. An epoch is a sequence of rounds that ends when a 7 is rolled.
    pub epoch_id: u64,

    /// The current point (0 = no point/come-out phase, 4/5/6/8/9/10 = established point).
    pub point: u8,

    /// Whether we're in the come-out phase (first roll of epoch).
    pub is_come_out: u8, // 0 = false, 1 = true

    /// Padding for alignment.
    pub _padding: [u8; 6],

    /// The round ID when this epoch started.
    pub epoch_start_round: u64,

    /// The SOL balance available as house bankroll for fixed-odds payouts.
    pub house_bankroll: u64,

    /// Total SOL paid out in craps winnings.
    pub total_payouts: u64,

    /// Total SOL collected from losing craps bets.
    pub total_collected: u64,

    /// Total potential payouts reserved for pending bets
    pub reserved_payouts: u64,
}

impl CrapsGame {
    pub fn pda() -> (Pubkey, u8) {
        craps_game_pda()
    }

    /// Check if we're in come-out phase.
    pub fn is_coming_out(&self) -> bool {
        self.is_come_out == 1
    }

    /// Set come-out phase.
    pub fn set_come_out(&mut self, is_come_out: bool) {
        self.is_come_out = if is_come_out { 1 } else { 0 };
    }

    /// Check if a point is established.
    pub fn has_point(&self) -> bool {
        self.point != 0
    }

    /// Get the point if established.
    pub fn get_point(&self) -> Option<u8> {
        if self.point == 0 {
            None
        } else {
            Some(self.point)
        }
    }

    /// Set the point.
    pub fn set_point(&mut self, point: u8) {
        self.point = point;
        self.is_come_out = 0;
    }

    /// Clear the point (for new epoch).
    pub fn clear_point(&mut self) {
        self.point = 0;
        self.is_come_out = 1;
    }

    /// Start a new epoch.
    pub fn start_new_epoch(&mut self, round_id: u64) {
        self.epoch_id += 1;
        self.epoch_start_round = round_id;
        self.clear_point();
    }
}

account!(OreAccount, CrapsGame);
