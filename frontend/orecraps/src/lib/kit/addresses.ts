/**
 * Program Addresses using Anza Kit
 *
 * This module defines all program and token addresses using the new Address type.
 * Provides both Kit Address types and compatibility functions for legacy PublicKey.
 */

import { address, type Address, getProgramDerivedAddress } from "@solana/kit";

// Program IDs
export const ORE_PROGRAM_ID: Address = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
export const ENTROPY_PROGRAM_ID: Address = address("EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1");

// Token Mints
export const RNG_MINT: Address = address("RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");
export const CRAP_MINT: Address = address("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

// System Programs
export const SYSTEM_PROGRAM_ID: Address = address("11111111111111111111111111111111");
export const TOKEN_PROGRAM_ID: Address = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID: Address = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// Token decimals
export const TOKEN_DECIMALS = 11;
export const RNG_DECIMALS = 9;
export const CRAP_DECIMALS = 9;
export const ONE_ORE = 100_000_000_000n; // 10^11
export const ONE_RNG = 1_000_000_000n; // 10^9
export const ONE_CRAP = 1_000_000_000n; // 10^9

/**
 * Convert bigint to little-endian Uint8Array for PDA seeds
 */
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

/**
 * Get the Board PDA
 */
export async function getBoardPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("board")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get a Round PDA for a specific round ID
 */
export async function getRoundPDA(roundId: bigint): Promise<{ pda: Address; bump: number }> {
  const seeds = [
    new TextEncoder().encode("round"),
    toLeBytes(roundId, 8),
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Miner PDA for an authority
 */
export async function getMinerPDA(authority: Address): Promise<{ pda: Address; bump: number }> {
  const authorityBytes = new TextEncoder().encode(authority);
  const seeds = [
    new TextEncoder().encode("miner"),
    authorityBytes,
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Treasury PDA
 */
export async function getTreasuryPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("treasury")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Config PDA
 */
export async function getConfigPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("config")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Craps Game PDA (singleton)
 */
export async function getCrapsGamePDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("craps_game")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Craps Position PDA for a player
 */
export async function getCrapsPositionPDA(authority: Address): Promise<{ pda: Address; bump: number }> {
  const authorityBytes = new TextEncoder().encode(authority);
  const seeds = [
    new TextEncoder().encode("craps_position"),
    authorityBytes,
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Craps Vault PDA
 */
export async function getCrapsVaultPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("craps_vault")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Automation PDA for an authority
 */
export async function getAutomationPDA(authority: Address): Promise<{ pda: Address; bump: number }> {
  const authorityBytes = new TextEncoder().encode(authority);
  const seeds = [
    new TextEncoder().encode("automation"),
    authorityBytes,
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get the Entropy Var PDA
 */
export async function getEntropyVarPDA(board: Address, id: bigint): Promise<{ pda: Address; bump: number }> {
  const boardBytes = new TextEncoder().encode(board);
  const seeds = [
    new TextEncoder().encode("var"),
    boardBytes,
    toLeBytes(id, 8),
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ENTROPY_PROGRAM_ID,
    seeds,
  });
  return { pda, bump };
}
