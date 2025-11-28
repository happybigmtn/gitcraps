//! TypeScript bindings generation for frontend types.
//!
//! This module exports Rust types to TypeScript using ts-rs.
//! Enable with the `ts-bindings` feature flag.

// Re-export types with TS derive when feature is enabled
#[cfg(feature = "ts-bindings")]
mod ts_types {
    use ts_rs::TS;

    /// TypeScript export for CrapsBetType enum
    #[derive(TS)]
    #[ts(export, export_to = "../frontend/orecraps/src/generated/")]
    #[allow(dead_code)]
    pub enum CrapsBetTypeTS {
        // Line bets
        PassLine = 0,
        DontPass = 1,
        PassOdds = 2,
        DontPassOdds = 3,

        // Come bets (point specified in data)
        Come = 4,
        DontCome = 5,
        ComeOdds = 6,
        DontComeOdds = 7,

        // Place bets (point specified in data)
        Place = 8,

        // Hardways (hardway number specified in data)
        Hardway = 9,

        // Single-roll bets
        Field = 10,
        AnySeven = 11,
        AnyCraps = 12,
        YoEleven = 13,
        Aces = 14,
        Twelve = 15,
    }

    /// TypeScript export for CrapsGame state
    #[derive(TS)]
    #[ts(export, export_to = "../frontend/orecraps/src/generated/")]
    #[allow(dead_code)]
    pub struct CrapsGameTS {
        /// The current epoch number
        pub epoch_id: u64,
        /// The current point (0 = no point, 4/5/6/8/9/10 = established point)
        pub point: u8,
        /// Whether we're in the come-out phase
        pub is_come_out: bool,
        /// The round ID when this epoch started
        pub epoch_start_round: u64,
        /// The SOL balance available as house bankroll
        pub house_bankroll: u64,
        /// Total SOL paid out in craps winnings
        pub total_payouts: u64,
        /// Total SOL collected from losing craps bets
        pub total_collected: u64,
        /// Total potential payouts reserved for pending bets
        pub reserved_payouts: u64,
    }

    /// TypeScript export for CrapsPosition state
    #[derive(TS)]
    #[ts(export, export_to = "../frontend/orecraps/src/generated/")]
    #[allow(dead_code)]
    pub struct CrapsPositionTS {
        /// The authority (owner) of this craps position
        pub authority: String, // Pubkey as string
        /// The epoch ID these bets are for
        pub epoch_id: u64,

        // Line bets
        pub pass_line: u64,
        pub dont_pass: u64,
        pub pass_odds: u64,
        pub dont_pass_odds: u64,

        // Come bets (6 elements for points 4,5,6,8,9,10)
        pub come_bets: [u64; 6],
        pub come_odds: [u64; 6],
        pub dont_come_bets: [u64; 6],
        pub dont_come_odds: [u64; 6],

        // Place bets
        pub place_bets: [u64; 6],
        pub place_working: bool,

        // Hardways (4 elements for 4,6,8,10)
        pub hardways: [u64; 4],

        // Single-roll bets
        pub field_bet: u64,
        pub any_seven: u64,
        pub any_craps: u64,
        pub yo_eleven: u64,
        pub aces: u64,
        pub twelve: u64,

        // Tracking
        pub pending_winnings: u64,
        pub total_wagered: u64,
        pub total_won: u64,
        pub total_lost: u64,
        pub last_updated_round: u64,
    }

    /// Payout ratio
    #[derive(TS)]
    #[ts(export, export_to = "../frontend/orecraps/src/generated/")]
    #[allow(dead_code)]
    pub struct PayoutRatio {
        pub num: u64,
        pub den: u64,
    }

    /// All craps payout constants
    #[derive(TS)]
    #[ts(export, export_to = "../frontend/orecraps/src/generated/")]
    #[allow(dead_code)]
    pub struct CrapsPayouts {
        pub pass_line: PayoutRatio,
        pub dont_pass: PayoutRatio,
        pub field_normal: PayoutRatio,
        pub field_special: PayoutRatio,
        pub any_seven: PayoutRatio,
        pub any_craps: PayoutRatio,
        pub yo_eleven: PayoutRatio,
        pub aces: PayoutRatio,
        pub twelve: PayoutRatio,
        pub place4_10: PayoutRatio,
        pub place5_9: PayoutRatio,
        pub place6_8: PayoutRatio,
        pub true_odds4_10: PayoutRatio,
        pub true_odds5_9: PayoutRatio,
        pub true_odds6_8: PayoutRatio,
        pub hard4_10: PayoutRatio,
        pub hard6_8: PayoutRatio,
    }
}

#[cfg(feature = "ts-bindings")]
#[cfg(test)]
mod tests {
    use super::ts_types::*;
    use ts_rs::TS;

    #[test]
    fn export_bindings() {
        // This test generates the TypeScript bindings when run with --features ts-bindings
        CrapsBetTypeTS::export().expect("Failed to export CrapsBetTypeTS");
        CrapsGameTS::export().expect("Failed to export CrapsGameTS");
        CrapsPositionTS::export().expect("Failed to export CrapsPositionTS");
        PayoutRatio::export().expect("Failed to export PayoutRatio");
        CrapsPayouts::export().expect("Failed to export CrapsPayouts");
    }
}
