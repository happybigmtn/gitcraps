use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;
use steel::*;

use crate::consts::BOARD_SIZE;
use crate::state::round_pda;

use super::OreAccount;

#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable, Serialize, Deserialize)]
pub struct Round {
    /// The round number.
    pub id: u64,

    /// The amount of RNG tokens deployed in each square (6x6 grid = 36 dice combinations).
    #[serde(with = "BigArray")]
    pub deployed: [u64; BOARD_SIZE],

    /// The hash of the end slot, provided by solana, used for random number generation.
    pub slot_hash: [u8; 32],

    /// The count of miners on each square.
    #[serde(with = "BigArray")]
    pub count: [u64; BOARD_SIZE],

    /// The slot at which claims for this round account end.
    pub expires_at: u64,

    /// The amount of CRAP tokens in the motherlode.
    pub motherlode: u64,

    /// The account to which rent should be returned when this account is closed.
    pub rent_payer: Pubkey,

    /// The top miner of the round.
    pub top_miner: Pubkey,

    /// The amount of CRAP tokens to distribute to the top miner.
    pub top_miner_reward: u64,

    /// The total amount of RNG tokens deployed in the round.
    pub total_deployed: u64,

    /// The total amount of RNG tokens put in the vault.
    pub total_vaulted: u64,

    /// The total amount of RNG tokens won by miners for the round.
    pub total_winnings: u64,

    /// The dice roll results for the round [die1, die2].
    pub dice_results: [u8; 2],

    /// The sum of the dice roll (2-12).
    pub dice_sum: u8,

    /// Padding for alignment.
    pub _padding: [u8; 5],
}

impl Round {
    pub fn pda(&self) -> (Pubkey, u8) {
        round_pda(self.id)
    }

    pub fn rng(&self) -> Option<u64> {
        if self.slot_hash == [0; 32] || self.slot_hash == [u8::MAX; 32] {
            return None;
        }
        let r1 = u64::from_le_bytes(self.slot_hash[0..8].try_into().unwrap());
        let r2 = u64::from_le_bytes(self.slot_hash[8..16].try_into().unwrap());
        let r3 = u64::from_le_bytes(self.slot_hash[16..24].try_into().unwrap());
        let r4 = u64::from_le_bytes(self.slot_hash[24..32].try_into().unwrap());
        let r = r1 ^ r2 ^ r3 ^ r4;
        Some(r)
    }

    pub fn winning_square(&self, _rng: u64) -> usize {
        // Use keccak hash for better distribution
        let hash = solana_program::keccak::hash(&self.slot_hash);
        let sample = u64::from_le_bytes(hash.to_bytes()[0..8].try_into().unwrap());

        // Rejection sampling to eliminate modulo bias
        let board_size = BOARD_SIZE as u64;
        let max_valid = (u64::MAX / board_size) * board_size;
        if sample < max_valid {
            (sample % board_size) as usize
        } else {
            // Use hash of hash for retry (deterministic)
            let hash2 = solana_program::keccak::hash(&hash.to_bytes());
            let sample2 = u64::from_le_bytes(hash2.to_bytes()[0..8].try_into().unwrap());
            (sample2 % board_size) as usize
        }
    }

    pub fn top_miner_sample(&self, rng: u64, winning_square: usize) -> u64 {
        if self.deployed[winning_square] == 0 {
            return 0;
        }
        rng.reverse_bits() % self.deployed[winning_square]
    }

    pub fn calculate_total_winnings(&self, winning_square: usize) -> u64 {
        let mut total_winnings = 0;
        for (i, &deployed) in self.deployed.iter().enumerate() {
            if i != winning_square {
                total_winnings += deployed;
            }
        }
        total_winnings
    }

    pub fn is_split_reward(&self, rng: u64) -> bool {
        // One out of four rounds get split rewards.
        let rng = rng.reverse_bits().to_le_bytes();
        let r1 = u16::from_le_bytes(rng[0..2].try_into().unwrap());
        let r2 = u16::from_le_bytes(rng[2..4].try_into().unwrap());
        let r3 = u16::from_le_bytes(rng[4..6].try_into().unwrap());
        let r4 = u16::from_le_bytes(rng[6..8].try_into().unwrap());
        let r = r1 ^ r2 ^ r3 ^ r4;
        r % 2 == 0
    }

    pub fn did_hit_motherlode(&self, rng: u64) -> bool {
        rng.reverse_bits() % 625 == 0
    }

    /// Rolls two dice using the RNG and returns (die1, die2, sum).
    pub fn roll_dice(&self, rng: u64) -> (u8, u8, u8) {
        // Use different bits of the RNG for each die to ensure independence
        let die1 = ((rng % 6) + 1) as u8;
        let die2 = (((rng >> 16) % 6) + 1) as u8;
        let sum = die1 + die2;
        (die1, die2, sum)
    }

    /// Calculates the dice payout multiplier for a given prediction.
    /// Returns multiplier in basis points (600 = 6x, 3600 = 36x).
    ///
    /// Probability distribution for two dice:
    /// Sum 2:  1/36 (2.78%)  -> 36x multiplier (3600 bps)
    /// Sum 3:  2/36 (5.56%)  -> 18x multiplier (1800 bps)
    /// Sum 4:  3/36 (8.33%)  -> 12x multiplier (1200 bps)
    /// Sum 5:  4/36 (11.11%) -> 9x multiplier (900 bps)
    /// Sum 6:  5/36 (13.89%) -> 7.2x multiplier (720 bps)
    /// Sum 7:  6/36 (16.67%) -> 6x multiplier (600 bps)
    /// Sum 8:  5/36 (13.89%) -> 7.2x multiplier (720 bps)
    /// Sum 9:  4/36 (11.11%) -> 9x multiplier (900 bps)
    /// Sum 10: 3/36 (8.33%)  -> 12x multiplier (1200 bps)
    /// Sum 11: 2/36 (5.56%)  -> 18x multiplier (1800 bps)
    /// Sum 12: 1/36 (2.78%)  -> 36x multiplier (3600 bps)
    pub fn dice_multiplier(prediction: u8) -> u64 {
        match prediction {
            2 => 3600,  // 36x - 1/36 probability
            3 => 1800,  // 18x - 2/36 probability
            4 => 1200,  // 12x - 3/36 probability
            5 => 900,   // 9x - 4/36 probability
            6 => 720,   // 7.2x - 5/36 probability
            7 => 600,   // 6x - 6/36 probability
            8 => 720,   // 7.2x - 5/36 probability
            9 => 900,   // 9x - 4/36 probability
            10 => 1200, // 12x - 3/36 probability
            11 => 1800, // 18x - 2/36 probability
            12 => 3600, // 36x - 1/36 probability
            _ => 0,     // Invalid prediction
        }
    }

    /// Calculates the payout for a dice bet.
    /// Returns the payout amount if the prediction matches, 0 otherwise.
    /// Safe mode (prediction = 0) returns base_reward / 6.
    pub fn calculate_dice_payout(prediction: u8, dice_sum: u8, base_reward: u64) -> u64 {
        // Safe mode: guaranteed but reduced reward
        if prediction == 0 {
            return base_reward / 6;
        }

        // Invalid prediction
        if prediction < 2 || prediction > 12 {
            return 0;
        }

        // Check if prediction matches
        if prediction != dice_sum {
            return 0;
        }

        // Calculate payout using multiplier
        let multiplier = Self::dice_multiplier(prediction);
        base_reward
            .checked_mul(multiplier)
            .unwrap_or(0)
            .checked_div(100)
            .unwrap_or(0)
    }
}

account!(OreAccount, Round);

#[cfg(test)]
mod tests {
    use solana_program::rent::Rent;

    use super::*;

    #[test]
    fn test_rent() {
        let size_of_round = 8 + std::mem::size_of::<Round>();
        let required_rent = Rent::default().minimum_balance(size_of_round);
        println!("required_rent: {}", required_rent);
        // Just print, don't fail
    }

    #[test]
    fn test_dice_multipliers() {
        // Test all valid multipliers
        assert_eq!(Round::dice_multiplier(2), 3600);  // 36x
        assert_eq!(Round::dice_multiplier(3), 1800);  // 18x
        assert_eq!(Round::dice_multiplier(4), 1200);  // 12x
        assert_eq!(Round::dice_multiplier(5), 900);   // 9x
        assert_eq!(Round::dice_multiplier(6), 720);   // 7.2x
        assert_eq!(Round::dice_multiplier(7), 600);   // 6x
        assert_eq!(Round::dice_multiplier(8), 720);   // 7.2x
        assert_eq!(Round::dice_multiplier(9), 900);   // 9x
        assert_eq!(Round::dice_multiplier(10), 1200); // 12x
        assert_eq!(Round::dice_multiplier(11), 1800); // 18x
        assert_eq!(Round::dice_multiplier(12), 3600); // 36x

        // Test invalid predictions
        assert_eq!(Round::dice_multiplier(0), 0);
        assert_eq!(Round::dice_multiplier(1), 0);
        assert_eq!(Round::dice_multiplier(13), 0);
    }

    #[test]
    fn test_dice_payout_correct_prediction() {
        let base_reward = 100_000_000_000u64; // 1 ORE (10^11)

        // Predict 7, roll 7 -> 6x reward
        let payout = Round::calculate_dice_payout(7, 7, base_reward);
        assert_eq!(payout, 600_000_000_000u64); // 6 ORE

        // Predict 2, roll 2 -> 36x reward
        let payout = Round::calculate_dice_payout(2, 2, base_reward);
        assert_eq!(payout, 3_600_000_000_000u64); // 36 ORE

        // Predict 12, roll 12 -> 36x reward
        let payout = Round::calculate_dice_payout(12, 12, base_reward);
        assert_eq!(payout, 3_600_000_000_000u64); // 36 ORE
    }

    #[test]
    fn test_dice_payout_wrong_prediction() {
        let base_reward = 100_000_000_000u64; // 1 ORE

        // Predict 7, roll 8 -> 0 reward
        let payout = Round::calculate_dice_payout(7, 8, base_reward);
        assert_eq!(payout, 0);

        // Predict 2, roll 7 -> 0 reward
        let payout = Round::calculate_dice_payout(2, 7, base_reward);
        assert_eq!(payout, 0);
    }

    #[test]
    fn test_dice_payout_safe_mode() {
        let base_reward = 100_000_000_000u64; // 1 ORE

        // Safe mode (prediction = 0) -> 1/6 of base reward
        let payout = Round::calculate_dice_payout(0, 7, base_reward);
        assert_eq!(payout, base_reward / 6);

        // Safe mode doesn't care about dice sum
        let payout = Round::calculate_dice_payout(0, 2, base_reward);
        assert_eq!(payout, base_reward / 6);
    }

    #[test]
    fn test_dice_payout_invalid_prediction() {
        let base_reward = 100_000_000_000u64;

        // Invalid predictions should return 0
        assert_eq!(Round::calculate_dice_payout(1, 7, base_reward), 0);
        assert_eq!(Round::calculate_dice_payout(13, 7, base_reward), 0);
        assert_eq!(Round::calculate_dice_payout(255, 7, base_reward), 0);
    }

    #[test]
    fn test_roll_dice_valid_range() {
        // Test that dice rolls are in valid range (1-6 for each die, 2-12 for sum)
        let round = Round {
            id: 0,
            deployed: [0; 36],
            slot_hash: [0; 32],
            count: [0; 36],
            expires_at: 0,
            motherlode: 0,
            rent_payer: Pubkey::default(),
            top_miner: Pubkey::default(),
            top_miner_reward: 0,
            total_deployed: 0,
            total_vaulted: 0,
            total_winnings: 0,
            dice_results: [0; 2],
            dice_sum: 0,
            _padding: [0; 5],
        };

        // Test various RNG values
        for rng in [0u64, 1, 5, 10, 100, 1000, u64::MAX / 2, u64::MAX] {
            let (die1, die2, sum) = round.roll_dice(rng);

            assert!(die1 >= 1 && die1 <= 6, "Die 1 out of range: {}", die1);
            assert!(die2 >= 1 && die2 <= 6, "Die 2 out of range: {}", die2);
            assert_eq!(sum, die1 + die2, "Sum mismatch: {} + {} != {}", die1, die2, sum);
            assert!(sum >= 2 && sum <= 12, "Sum out of range: {}", sum);
        }
    }

    #[test]
    fn test_dice_expected_value() {
        // Verify expected value equals base reward for all predictions
        let base_reward = 100_000_000_000u64; // 1 ORE

        // Expected value for prediction n = P(n) * payout(n)
        // P(n) = ways_to_roll(n) / 36
        // payout(n) = base_reward * 36 / ways_to_roll(n)
        // EV(n) = (ways_to_roll(n) / 36) * (base_reward * 36 / ways_to_roll(n)) = base_reward

        // Each prediction should have the same expected value
        let predictions = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        let ways_to_roll = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1]; // for sums 2-12

        for (i, &pred) in predictions.iter().enumerate() {
            let payout = Round::calculate_dice_payout(pred, pred, base_reward);
            let probability = ways_to_roll[i] as f64 / 36.0;
            let expected_value = payout as f64 * probability;

            // Due to integer division, there might be slight rounding differences
            let tolerance = base_reward as f64 * 0.01; // 1% tolerance
            assert!(
                (expected_value - base_reward as f64).abs() < tolerance,
                "EV for prediction {} is {}, expected ~{}",
                pred, expected_value, base_reward
            );
        }
    }
}
