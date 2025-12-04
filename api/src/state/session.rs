use serde::{Deserialize, Serialize};
use steel::*;

use super::OreAccount;

/// Session account - allows a delegate key to sign transactions on behalf of a user
/// for a limited time period. The delegate cannot perform withdrawals.
///
/// PDA: ["session", user.to_bytes()]
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable, Serialize, Deserialize)]
pub struct Session {
    /// The user who owns this session.
    pub authority: Pubkey,

    /// The delegate key that can sign on behalf of the user.
    pub delegate: Pubkey,

    /// Unix timestamp when the session expires.
    pub expires_at: i64,

    /// Unix timestamp when the session was created.
    pub created_at: i64,

    /// Bitmask of allowed operations.
    /// Bit 0: Games (betting, hitting, folding, etc.)
    /// Bit 1: Swaps (exchange operations)
    /// Bit 2: Staking (deposits only, NOT withdrawals)
    /// Bit 3: Mining (deploy, automate, etc.)
    /// Withdrawals are NEVER allowed via session.
    pub allowed_operations: u64,

    /// Reserved for future use.
    pub _reserved: [u8; 32],
}

impl Session {
    /// Check if the session is still valid (not expired).
    pub fn is_valid(&self, current_time: i64) -> bool {
        current_time < self.expires_at
    }

    /// Check if the session allows a specific operation type.
    pub fn allows_operation(&self, op: SessionOperation) -> bool {
        (self.allowed_operations & (1u64 << (op as u8))) != 0
    }

    /// Create the allowed operations bitmask for all non-withdrawal operations.
    pub fn all_operations() -> u64 {
        (1u64 << SessionOperation::Games as u8)
            | (1u64 << SessionOperation::Swaps as u8)
            | (1u64 << SessionOperation::StakingDeposit as u8)
            | (1u64 << SessionOperation::Mining as u8)
    }
}

/// Session operation types (for bitmask).
#[repr(u8)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SessionOperation {
    /// All game betting/playing operations.
    Games = 0,
    /// Exchange/swap operations.
    Swaps = 1,
    /// Staking deposits only (NOT withdrawals).
    StakingDeposit = 2,
    /// Mining operations (deploy, automate, etc.).
    Mining = 3,
}

account!(OreAccount, Session);
