use bytemuck::{Pod, Zeroable};
use solana_program::pubkey::Pubkey;
use steel::*;

use super::OreAccount;

/// Exchange pool state for the Constant Product AMM (CPMM).
///
/// This pool maintains SOL/RNG liquidity using the x*y=k formula.
/// Liquidity providers deposit both tokens and receive LP tokens.
/// Swaps execute at the marginal rate determined by the reserves.
///
/// Fee structure: 1% total fee
/// - 50% stays in pool (LP rewards)
/// - 50% goes to protocol (stakers/treasury)
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct ExchangePool {
    /// The SOL vault token account (wSOL).
    pub sol_vault: Pubkey,

    /// The RNG vault token account.
    pub rng_vault: Pubkey,

    /// The LP token mint for this pool.
    pub lp_mint: Pubkey,

    /// The admin/authority that can update pool parameters.
    pub admin: Pubkey,

    /// Current SOL reserve (in lamports).
    pub sol_reserve: u64,

    /// Current RNG reserve (in base units).
    pub rng_reserve: u64,

    /// Constant product k = sol_reserve * rng_reserve.
    /// Stored as u128 to handle large products.
    /// Split into two u64 parts for Pod compatibility.
    pub k_low: u64,
    pub k_high: u64,

    /// Total LP tokens in circulation.
    pub total_lp_supply: u64,

    /// Fee numerator (100 = 1%).
    pub fee_numerator: u64,

    /// Fee denominator (10000 = 100%).
    pub fee_denominator: u64,

    /// Accumulated protocol fees in SOL (claimable by admin).
    pub protocol_fees_sol: u64,

    /// Accumulated protocol fees in RNG (claimable by admin).
    pub protocol_fees_rng: u64,

    /// Total trading volume in SOL (lifetime).
    pub total_volume_sol: u64,

    /// Total fees collected in SOL (lifetime).
    pub total_fees_collected_sol: u64,

    /// Total swaps executed (lifetime).
    pub total_swaps: u64,

    /// Minimum liquidity permanently locked (prevents pool drain).
    /// First LP provider must provide this minimum.
    pub minimum_liquidity: u64,

    /// Pool creation timestamp.
    pub created_at: i64,

    /// Last swap timestamp.
    pub last_swap_at: i64,

    /// Pool bump seed for PDA derivation.
    pub bump: u8,

    /// Pool status: 0 = active, 1 = paused, 2 = deprecated.
    pub status: u8,

    /// Padding for alignment.
    pub _padding: [u8; 6],
}

impl ExchangePool {
    /// Get the constant product k as u128.
    pub fn k(&self) -> u128 {
        ((self.k_high as u128) << 64) | (self.k_low as u128)
    }

    /// Set the constant product k from u128.
    pub fn set_k(&mut self, k: u128) {
        self.k_low = k as u64;
        self.k_high = (k >> 64) as u64;
    }

    /// Calculate output amount for a swap using CPMM formula.
    /// Returns (output_amount, lp_fee, protocol_fee).
    pub fn calculate_swap_output(
        &self,
        input_amount: u64,
        input_reserve: u64,
        output_reserve: u64,
    ) -> Option<(u64, u64, u64)> {
        if input_amount == 0 || input_reserve == 0 || output_reserve == 0 {
            return None;
        }

        // Calculate total fee (1% = 100/10000)
        let total_fee = input_amount
            .checked_mul(self.fee_numerator)?
            .checked_div(self.fee_denominator)?;

        // Split fee: 50% to LP, 50% to protocol
        let protocol_fee = total_fee / 2;
        let lp_fee = total_fee - protocol_fee;

        // Input after fee goes into pool
        let input_with_lp_fee = input_amount.checked_sub(protocol_fee)?;

        // CPMM formula: output = (output_reserve * input_with_fee) / (input_reserve + input_with_fee)
        let numerator = (output_reserve as u128).checked_mul(input_with_lp_fee as u128)?;
        let denominator = (input_reserve as u128).checked_add(input_with_lp_fee as u128)?;
        let output = numerator.checked_div(denominator)? as u64;

        Some((output, lp_fee, protocol_fee))
    }

    /// Calculate LP tokens to mint for liquidity deposit.
    /// Uses geometric mean for first deposit, proportional for subsequent.
    pub fn calculate_lp_tokens(
        &self,
        sol_amount: u64,
        rng_amount: u64,
    ) -> Option<u64> {
        if self.total_lp_supply == 0 {
            // First deposit: LP = sqrt(sol * rng) - minimum_liquidity
            let product = (sol_amount as u128).checked_mul(rng_amount as u128)?;
            let sqrt = integer_sqrt(product);
            sqrt.checked_sub(self.minimum_liquidity as u128).map(|v| v as u64)
        } else {
            // Subsequent deposits: proportional to existing reserves
            // LP = min(sol_amount * total_lp / sol_reserve, rng_amount * total_lp / rng_reserve)
            let sol_lp = (sol_amount as u128)
                .checked_mul(self.total_lp_supply as u128)?
                .checked_div(self.sol_reserve as u128)? as u64;
            let rng_lp = (rng_amount as u128)
                .checked_mul(self.total_lp_supply as u128)?
                .checked_div(self.rng_reserve as u128)? as u64;
            Some(sol_lp.min(rng_lp))
        }
    }

    /// Calculate token amounts to return for LP token burn.
    pub fn calculate_withdraw_amounts(
        &self,
        lp_amount: u64,
    ) -> Option<(u64, u64)> {
        if lp_amount == 0 || self.total_lp_supply == 0 {
            return None;
        }

        // Proportional share of reserves
        let sol_amount = (lp_amount as u128)
            .checked_mul(self.sol_reserve as u128)?
            .checked_div(self.total_lp_supply as u128)? as u64;
        let rng_amount = (lp_amount as u128)
            .checked_mul(self.rng_reserve as u128)?
            .checked_div(self.total_lp_supply as u128)? as u64;

        Some((sol_amount, rng_amount))
    }

    /// Check if pool is active.
    pub fn is_active(&self) -> bool {
        self.status == 0
    }
}

/// Integer square root using Newton's method.
fn integer_sqrt(n: u128) -> u128 {
    if n == 0 {
        return 0;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

account!(OreAccount, ExchangePool);
