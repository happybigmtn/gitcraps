// Calculate expected struct sizes based on the Rust definitions

// Board struct:
// - discriminator: 8 bytes (Steel adds this)
// - round_id: u64 = 8 bytes
// - start_slot: u64 = 8 bytes
// - end_slot: u64 = 8 bytes
const boardSize = 8 + 8 + 8 + 8;
console.log("Expected Board size:", boardSize, "bytes");

// Config struct:
// - discriminator: 8 bytes
// - admin: Pubkey = 32 bytes
// - bury_authority: Pubkey = 32 bytes
// - fee_collector: Pubkey = 32 bytes
// - swap_program: Pubkey = 32 bytes
// - var_address: Pubkey = 32 bytes
// - admin_fee: u64 = 8 bytes
const configSize = 8 + 32 + 32 + 32 + 32 + 32 + 8;
console.log("Expected Config size:", configSize, "bytes");

// Round struct:
// - discriminator: 8 bytes
// - id: u64 = 8 bytes
// - deployed: [u64; 36] = 288 bytes
// - slot_hash: [u8; 32] = 32 bytes
// - count: [u64; 36] = 288 bytes
// - expires_at: u64 = 8 bytes
// - motherlode: u64 = 8 bytes
// - rent_payer: Pubkey = 32 bytes
// - top_miner: Pubkey = 32 bytes
// - top_miner_reward: u64 = 8 bytes
// - total_deployed: u64 = 8 bytes
// - total_vaulted: u64 = 8 bytes
// - total_winnings: u64 = 8 bytes
// - dice_results: [u8; 2] = 2 bytes
// - dice_sum: u8 = 1 byte
// - _padding: [u8; 5] = 5 bytes
const roundSize = 8 + 8 + 288 + 32 + 288 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 8 + 2 + 1 + 5;
console.log("Expected Round size:", roundSize, "bytes");

// On-chain sizes from devnet
console.log("\nOn-chain sizes (from devnet):");
console.log("  Board: 32 bytes");
console.log("  Config: 176 bytes");
console.log("  Round: 736 bytes");

console.log("\nMismatches:");
console.log("  Board: expected", boardSize, ", got 32 ->", boardSize === 32 ? "OK" : "MISMATCH by " + (boardSize - 32) + " bytes");
console.log("  Config: expected", configSize, ", got 176 ->", configSize === 176 ? "OK" : "MISMATCH by " + (configSize - 176) + " bytes");
console.log("  Round: expected", roundSize, ", got 736 ->", roundSize === 736 ? "OK" : "MISMATCH by " + (roundSize - 736) + " bytes");
