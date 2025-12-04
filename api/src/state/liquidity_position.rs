use bytemuck::{Pod, Zeroable};
use solana_program::pubkey::Pubkey;
use steel::*;

use super::OreAccount;

/// Liquidity provider position for the Exchange Pool.
///
/// Tracks a user's LP token holdings and deposit/withdrawal history.
/// LP tokens represent proportional ownership of the pool reserves.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct LiquidityPosition {
    /// The liquidity provider's authority (wallet).
    pub authority: Pubkey,

    /// The exchange pool this position is for.
    pub pool: Pubkey,

    /// Current LP tokens held.
    pub lp_tokens: u64,

    /// Total SOL deposited over lifetime.
    pub sol_deposited: u64,

    /// Total RNG deposited over lifetime.
    pub rng_deposited: u64,

    /// Total SOL withdrawn over lifetime.
    pub sol_withdrawn: u64,

    /// Total RNG withdrawn over lifetime.
    pub rng_withdrawn: u64,

    /// Number of deposit transactions.
    pub deposit_count: u64,

    /// Number of withdrawal transactions.
    pub withdraw_count: u64,

    /// Slot when position was created.
    pub created_slot: u64,

    /// Slot of last update.
    pub last_updated_slot: u64,

    /// Timestamp when position was created.
    pub created_at: i64,

    /// Timestamp of last update.
    pub last_updated_at: i64,

    /// Position bump seed for PDA derivation.
    pub bump: u8,

    /// Padding for alignment.
    pub _padding: [u8; 7],
}

impl LiquidityPosition {
    /// Calculate the current value of this position in pool tokens.
    /// Returns (sol_value, rng_value) based on current pool state.
    pub fn calculate_current_value(
        &self,
        pool_sol_reserve: u64,
        pool_rng_reserve: u64,
        pool_total_lp: u64,
    ) -> Option<(u64, u64)> {
        if self.lp_tokens == 0 || pool_total_lp == 0 {
            return Some((0, 0));
        }

        // Proportional share of reserves
        let sol_value = (self.lp_tokens as u128)
            .checked_mul(pool_sol_reserve as u128)?
            .checked_div(pool_total_lp as u128)? as u64;
        let rng_value = (self.lp_tokens as u128)
            .checked_mul(pool_rng_reserve as u128)?
            .checked_div(pool_total_lp as u128)? as u64;

        Some((sol_value, rng_value))
    }

    /// Calculate net PnL (profit and loss) from providing liquidity.
    /// Returns (sol_pnl, rng_pnl) as signed values (positive = profit).
    pub fn calculate_pnl(
        &self,
        pool_sol_reserve: u64,
        pool_rng_reserve: u64,
        pool_total_lp: u64,
    ) -> Option<(i64, i64)> {
        let (current_sol, current_rng) = self.calculate_current_value(
            pool_sol_reserve,
            pool_rng_reserve,
            pool_total_lp,
        )?;

        // Net deposit = deposited - withdrawn
        let net_sol_deposited = self.sol_deposited.saturating_sub(self.sol_withdrawn) as i64;
        let net_rng_deposited = self.rng_deposited.saturating_sub(self.rng_withdrawn) as i64;

        // PnL = current value - net deposit
        let sol_pnl = (current_sol as i64).checked_sub(net_sol_deposited)?;
        let rng_pnl = (current_rng as i64).checked_sub(net_rng_deposited)?;

        Some((sol_pnl, rng_pnl))
    }

    /// Calculate the share of the pool this position represents (in basis points).
    pub fn pool_share_bps(&self, pool_total_lp: u64) -> u64 {
        if pool_total_lp == 0 {
            return 0;
        }
        (self.lp_tokens as u128)
            .checked_mul(10000)
            .unwrap_or(0)
            .checked_div(pool_total_lp as u128)
            .unwrap_or(0) as u64
    }

    /// Check if this position has any LP tokens.
    pub fn has_liquidity(&self) -> bool {
        self.lp_tokens > 0
    }
}

account!(OreAccount, LiquidityPosition);
