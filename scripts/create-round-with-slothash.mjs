#!/usr/bin/env node
/**
 * Creates a Round account JSON file with a pre-set slot_hash for localnet testing.
 * The winning square is calculated from the slot_hash to ensure consistency.
 */

import * as fs from "fs";
import crypto from "crypto";
import pkg from "js-sha3";
const { keccak256 } = pkg;

// Read the current round account
const roundFile = process.argv[2] || "/tmp/round-account.json";
const outputFile = process.argv[3] || "/home/r/Coding/ore/.localnet-accounts/round-0-with-entropy.json";

const roundData = JSON.parse(fs.readFileSync(roundFile, "utf-8"));
const data = Buffer.from(roundData.account.data[0], "base64");

console.log("Original data length:", data.length);

// Round structure offsets (after 8-byte discriminator):
// - id: 0-8 (u64) = offset 8
// - deployed: 8-296 (36 * 8 = 288 bytes) = offset 16
// - slot_hash: 296-328 (32 bytes) = offset 304
// - count: 328-616 (36 * 8 = 288 bytes)
// - expires_at: 616-624 (u64)
// - motherlode: 624-632 (u64)
// - rent_payer: 632-664 (Pubkey 32 bytes)
// - top_miner: 664-696 (Pubkey 32 bytes)
// - top_miner_reward: 696-704 (u64)
// - total_deployed: 704-712 (u64)
// - total_vaulted: 712-720 (u64)
// - total_winnings: 720-728 (u64)
// - dice_results: 728-730 (2 bytes)
// - dice_sum: 730 (1 byte)
// - padding: 731-736 (5 bytes)

const SLOT_HASH_OFFSET = 8 + 8 + 288; // = 304

// Generate a random slot_hash
const slotHash = crypto.randomBytes(32);
console.log("Generated slot_hash:", slotHash.toString("hex"));

// Copy slot_hash into data
slotHash.copy(data, SLOT_HASH_OFFSET);

const BOARD_SIZE = 36n;
const U64_MAX = 0xFFFFFFFFFFFFFFFFn;

// Calculate winning square using Keccak-256 with rejection sampling
// (exactly matches on-chain solana_program::keccak::hash logic in round.rs:78-93)
function calculateWinningSquare(slotHashBytes) {
  // Keccak-256 hash of the slot_hash bytes
  const hashHex = keccak256(slotHashBytes);
  const hashBytes = Buffer.from(hashHex, "hex");

  // Read first 8 bytes as little-endian u64 (matches on-chain: u64::from_le_bytes)
  const sample = hashBytes.readBigUInt64LE(0);

  console.log("Hash:", hashHex.slice(0, 32) + "...");
  console.log("Sample (first 8 bytes LE):", sample.toString());

  // Rejection sampling to eliminate modulo bias (matches on-chain logic)
  const maxValid = (U64_MAX / BOARD_SIZE) * BOARD_SIZE;

  if (sample < maxValid) {
    const winningSquare = Number(sample % BOARD_SIZE);
    console.log("Using primary sample, winning_square:", winningSquare);
    return winningSquare;
  } else {
    // Use hash of hash for retry (deterministic) - matches on-chain
    console.log("Sample >= maxValid, using secondary hash");
    const hash2Hex = keccak256(hashBytes);
    const hash2Bytes = Buffer.from(hash2Hex, "hex");
    const sample2 = hash2Bytes.readBigUInt64LE(0);
    const winningSquare = Number(sample2 % BOARD_SIZE);
    console.log("Secondary sample:", sample2.toString());
    console.log("Using secondary sample, winning_square:", winningSquare);
    return winningSquare;
  }
}

function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2, die1 + die2];
}

const winningSquare = calculateWinningSquare(slotHash);
const [die1, die2, sum] = squareToDice(winningSquare);

console.log(`Winning square: ${winningSquare}`);
console.log(`Dice: ${die1} + ${die2} = ${sum}`);

// Update the output JSON
roundData.account.data[0] = data.toString("base64");

// Keep pubkey if it exists, validator needs it

// Fix rentEpoch - must be integer for JSON parsing
if (roundData.account.rentEpoch > Number.MAX_SAFE_INTEGER) {
  roundData.account.rentEpoch = 0;
}

fs.writeFileSync(outputFile, JSON.stringify(roundData, null, 2));
console.log(`Saved to: ${outputFile}`);

// Also save the calculated values for the test script
const meta = {
  slotHash: slotHash.toString("hex"),
  winningSquare,
  die1,
  die2,
  diceSum: sum,
};
fs.writeFileSync(outputFile.replace(".json", "-meta.json"), JSON.stringify(meta, null, 2));
console.log("Metadata saved");
