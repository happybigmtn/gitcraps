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

import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import crypto from "crypto";
import { ENTROPY_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./constants";

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

// Helper to convert bigint to little-endian bytes
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

// Helper to read u64 from bytes
function readU64(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(data[offset + i]) << BigInt(8 * i);
  }
  return value;
}

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

/**
 * Local Entropy Provider
 *
 * Manages the commit-reveal cycle for on-chain entropy generation.
 */
export class EntropyProvider {
  private connection: Connection;
  private provider: Keypair;
  private seeds: Map<string, Buffer[]>; // varAddress -> seed chain

  constructor(connection: Connection, providerKeypair: Keypair) {
    this.connection = connection;
    this.provider = providerKeypair;
    this.seeds = new Map();
  }

  /**
   * Generate a seed chain for N samples
   * seed[n-1] = keccak(seed[n])
   * Returns [seed_0, seed_1, ..., seed_n] where seed_0 is revealed first
   */
  generateSeedChain(samples: number): Buffer[] {
    const chain: Buffer[] = [];
    let currentSeed = crypto.randomBytes(32);

    // Generate chain backwards: start with random, hash to get previous
    for (let i = samples - 1; i >= 0; i--) {
      chain.unshift(currentSeed);
      currentSeed = keccak256(currentSeed);
    }

    return chain;
  }

  /**
   * Get commit hash for a seed chain (hash of first seed to be revealed)
   */
  getCommit(seedChain: Buffer[]): Buffer {
    if (seedChain.length === 0) {
      throw new Error("Empty seed chain");
    }
    return keccak256(seedChain[0]);
  }

  /**
   * Build Open instruction
   *
   * Initializes a new Var account with commit
   */
  createOpenInstruction(
    authority: PublicKey,
    payer: PublicKey,
    id: bigint,
    commit: Buffer,
    isAuto: boolean,
    samples: bigint,
    endAt: bigint
  ): TransactionInstruction {
    const [varAddress] = varPDA(authority, id);

    // Instruction data layout:
    // [discriminator: 1 byte][id: 8 bytes][commit: 32 bytes][is_auto: 8 bytes][samples: 8 bytes][end_at: 8 bytes]
    const data = Buffer.alloc(65);
    data[0] = EntropyInstruction.Open;
    data.set(toLeBytes(id, 8), 1);
    commit.copy(data, 9);
    data.set(toLeBytes(isAuto ? 1n : 0n, 8), 41);
    data.set(toLeBytes(samples, 8), 49);
    data.set(toLeBytes(endAt, 8), 57);

    return new TransactionInstruction({
      programId: ENTROPY_PROGRAM_ID,
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: this.provider.publicKey, isSigner: false, isWritable: false },
        { pubkey: varAddress, isSigner: false, isWritable: true },
        { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build Sample instruction
   *
   * Captures slot_hash at the end_at slot
   */
  createSampleInstruction(
    signer: PublicKey,
    authority: PublicKey,
    id: bigint
  ): TransactionInstruction {
    const [varAddress] = varPDA(authority, id);

    const data = Buffer.alloc(1);
    data[0] = EntropyInstruction.Sample;

    return new TransactionInstruction({
      programId: ENTROPY_PROGRAM_ID,
      keys: [
        { pubkey: signer, isSigner: true, isWritable: true },
        { pubkey: varAddress, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  /**
   * Build Reveal instruction
   *
   * Discloses the seed to finalize the random value
   */
  createRevealInstruction(
    signer: PublicKey,
    authority: PublicKey,
    id: bigint,
    seed: Buffer
  ): TransactionInstruction {
    const [varAddress] = varPDA(authority, id);

    // Instruction data: [discriminator: 1 byte][seed: 32 bytes]
    const data = Buffer.alloc(33);
    data[0] = EntropyInstruction.Reveal;
    seed.copy(data, 1);

    return new TransactionInstruction({
      programId: ENTROPY_PROGRAM_ID,
      keys: [
        { pubkey: signer, isSigner: true, isWritable: true },
        { pubkey: varAddress, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Build Next instruction
   *
   * Advances to next sample in the chain
   */
  createNextInstruction(
    signer: PublicKey,
    authority: PublicKey,
    id: bigint,
    endAt: bigint
  ): TransactionInstruction {
    const [varAddress] = varPDA(authority, id);

    // Instruction data: [discriminator: 1 byte][end_at: 8 bytes]
    const data = Buffer.alloc(9);
    data[0] = EntropyInstruction.Next;
    data.set(toLeBytes(endAt, 8), 1);

    return new TransactionInstruction({
      programId: ENTROPY_PROGRAM_ID,
      keys: [
        { pubkey: signer, isSigner: true, isWritable: true },
        { pubkey: varAddress, isSigner: false, isWritable: true },
      ],
      data,
    });
  }

  /**
   * Store a seed chain for a var address
   */
  storeSeedChain(varAddress: PublicKey, seedChain: Buffer[]): void {
    this.seeds.set(varAddress.toBase58(), seedChain);
  }

  /**
   * Get the next seed to reveal for a var
   */
  getNextSeed(varAddress: PublicKey): Buffer | null {
    const chain = this.seeds.get(varAddress.toBase58());
    if (!chain || chain.length === 0) return null;
    return chain[0];
  }

  /**
   * Consume a seed after reveal
   */
  consumeSeed(varAddress: PublicKey): Buffer | null {
    const chain = this.seeds.get(varAddress.toBase58());
    if (!chain || chain.length === 0) return null;
    return chain.shift() || null;
  }

  /**
   * Parse a Var account
   */
  parseVarAccount(data: Uint8Array): VarAccount {
    if (data.length < VAR_ACCOUNT_SIZE) {
      throw new Error(`Invalid Var account size: ${data.length}`);
    }

    return {
      authority: new PublicKey(data.slice(VAR_OFFSETS.authority, VAR_OFFSETS.authority + 32)),
      id: readU64(data, VAR_OFFSETS.id),
      provider: new PublicKey(data.slice(VAR_OFFSETS.provider, VAR_OFFSETS.provider + 32)),
      commit: Buffer.from(data.slice(VAR_OFFSETS.commit, VAR_OFFSETS.commit + 32)),
      seed: Buffer.from(data.slice(VAR_OFFSETS.seed, VAR_OFFSETS.seed + 32)),
      slotHash: Buffer.from(data.slice(VAR_OFFSETS.slot_hash, VAR_OFFSETS.slot_hash + 32)),
      value: Buffer.from(data.slice(VAR_OFFSETS.value, VAR_OFFSETS.value + 32)),
      samples: readU64(data, VAR_OFFSETS.samples),
      isAuto: readU64(data, VAR_OFFSETS.is_auto) !== 0n,
      startAt: readU64(data, VAR_OFFSETS.start_at),
      endAt: readU64(data, VAR_OFFSETS.end_at),
    };
  }

  /**
   * Check if a Var account is ready for sampling
   */
  async isReadyForSample(authority: PublicKey, id: bigint): Promise<boolean> {
    const [varAddress] = varPDA(authority, id);
    const account = await this.connection.getAccountInfo(varAddress);
    if (!account) return false;

    const var_ = this.parseVarAccount(account.data);
    const slot = await this.connection.getSlot();

    // Ready if: slot >= end_at and slot_hash is zero
    return slot >= var_.endAt && var_.slotHash.every((b) => b === 0);
  }

  /**
   * Check if a Var account is ready for reveal
   */
  async isReadyForReveal(authority: PublicKey, id: bigint): Promise<boolean> {
    const [varAddress] = varPDA(authority, id);
    const account = await this.connection.getAccountInfo(varAddress);
    if (!account) return false;

    const var_ = this.parseVarAccount(account.data);

    // Ready if: slot_hash is non-zero and value is zero
    const hasSlotHash = !var_.slotHash.every((b) => b === 0);
    const needsValue = var_.value.every((b) => b === 0);

    return hasSlotHash && needsValue;
  }

  /**
   * Get the provider's public key
   */
  getProviderPubkey(): PublicKey {
    return this.provider.publicKey;
  }
}

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
