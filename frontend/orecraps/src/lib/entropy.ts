/**
 * Local Entropy Provider for Solana Localnet Testing
 *
 * This module implements the commit-reveal VRF scheme used by the entropy program.
 * It allows fully on-chain testing of dice rolls on localnet without needing
 * the external entropy provider service.
 *
 * Flow:
 * 1. Generate seed chain: seed[n-1] = keccak(seed[n])
 * 2. Open: commit = keccak(seed[0]), store seed chain
 * 3. Sample: capture slot_hash at end_at slot
 * 4. Reveal: disclose seed, value = keccak(slot_hash || seed || samples)
 */

import { PublicKey } from "@solana/web3.js";
import crypto from "crypto";
import { ENTROPY_PROGRAM_ID } from "./constants";
import { toLeBytes, readU64 } from "./bufferUtils";

// Instruction discriminators for entropy program
export enum EntropyInstruction {
  Open = 0,
  Close = 1,
  Next = 2,
  // 3 is skipped
  Reveal = 4,
  Sample = 5,
}

// Var account structure offsets
export const VAR_OFFSETS = {
  authority: 0,      // 32 bytes
  id: 32,            // 8 bytes
  provider: 40,      // 32 bytes
  commit: 72,        // 32 bytes
  seed: 104,         // 32 bytes
  slot_hash: 136,    // 32 bytes
  value: 168,        // 32 bytes
  samples: 200,      // 8 bytes
  is_auto: 208,      // 8 bytes
  start_at: 216,     // 8 bytes
  end_at: 224,       // 8 bytes
};

export const VAR_ACCOUNT_SIZE = 232;

/**
 * Calculate keccak256 hash (using SHA3-256 as browser-compatible approximation)
 * Note: Solana uses keccak256, which is different from SHA3-256
 * For true compatibility, we'd need a keccak256 implementation
 */
function keccak256(data: Buffer): Buffer {
  // Use SHA3-256 as approximation (for true keccak256, use a library like js-sha3)
  return crypto.createHash("sha3-256").update(data).digest();
}

/**
 * Derive Var PDA address
 */
export function varPDA(authority: PublicKey, id: bigint): [PublicKey, number] {
  const idBytes = toLeBytes(id, 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("var"), authority.toBuffer(), idBytes],
    ENTROPY_PROGRAM_ID
  );
}

// EntropyProvider class removed - unused (246 lines)

/**
 * Parsed Var account structure
 */
export interface VarAccount {
  authority: PublicKey;
  id: bigint;
  provider: PublicKey;
  commit: Buffer;
  seed: Buffer;
  slotHash: Buffer;
  value: Buffer;
  samples: bigint;
  isAuto: boolean;
  startAt: bigint;
  endAt: bigint;
}

/**
 * Calculate dice result from entropy value
 * Matches on-chain logic
 */
export function calculateDiceFromValue(value: Buffer): {
  die1: number;
  die2: number;
  sum: number;
  winningSquare: number;
} {
  // Sample from value: take first 8 bytes as u64
  const sample = readU64(new Uint8Array(value), 0);

  // Board size is 36 (6x6 dice grid)
  const boardSize = 36n;
  const maxValid = (0xffffffffffffffffn / boardSize) * boardSize;

  let winningSquare: number;
  if (sample < maxValid) {
    winningSquare = Number(sample % boardSize);
  } else {
    // Fallback - rehash
    const rehash = keccak256(value);
    const sample2 = readU64(new Uint8Array(rehash), 0);
    winningSquare = Number(sample2 % boardSize);
  }

  // Convert square to dice
  const { squareToDice } = require('./dice');
  const [die1, die2] = squareToDice(winningSquare);
  const sum = die1 + die2;

  return { die1, die2, sum, winningSquare };
}
