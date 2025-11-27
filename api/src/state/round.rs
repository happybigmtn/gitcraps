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
        assert!(false);
    }
}
