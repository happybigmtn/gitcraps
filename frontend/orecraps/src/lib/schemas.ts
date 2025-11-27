/**
 * Borsh schema definitions for on-chain account data
 * These match the Rust struct definitions in the program
 *
 * Note: This file provides schema definitions for future Borsh-based parsing.
 * The existing manual parsing in program.ts remains functional.
 */

// Schema type definitions (compatible with @coral-xyz/borsh or borsh-js)
export interface SchemaField {
  name: string;
  type: string | SchemaField[];
}

/**
 * CrapsGame account schema
 * Matches: api/src/state/craps_game.rs
 */
export const CrapsGameSchema: SchemaField[] = [
  { name: 'discriminator', type: 'u8' },
  { name: 'epochId', type: 'u64' },
  { name: 'point', type: 'u8' },
  { name: 'isComeOut', type: 'u8' },
  { name: 'padding', type: '[u8; 6]' },
  { name: 'epochStartRound', type: 'u64' },
  { name: 'houseBankroll', type: 'u64' },
  { name: 'totalPayouts', type: 'u64' },
  { name: 'totalCollected', type: 'u64' },
];

/**
 * CrapsPosition account schema
 * Matches: api/src/state/craps_position.rs
 */
export const CrapsPositionSchema: SchemaField[] = [
  { name: 'discriminator', type: 'u8' },
  { name: 'authority', type: 'publicKey' },
  { name: 'epochId', type: 'u64' },
  { name: 'passLine', type: 'u64' },
  { name: 'dontPass', type: 'u64' },
  { name: 'passOdds', type: 'u64' },
  { name: 'dontPassOdds', type: 'u64' },
  { name: 'comeBets', type: '[u64; 6]' },
  { name: 'comeOdds', type: '[u64; 6]' },
  { name: 'dontComeBets', type: '[u64; 6]' },
  { name: 'dontComeOdds', type: '[u64; 6]' },
  { name: 'placeBets', type: '[u64; 6]' },
  { name: 'placeWorking', type: 'u8' },
  { name: 'padding1', type: '[u8; 7]' },
  { name: 'hardways', type: '[u64; 4]' },
  { name: 'fieldBet', type: 'u64' },
  { name: 'anySeven', type: 'u64' },
  { name: 'anyCraps', type: 'u64' },
  { name: 'yoEleven', type: 'u64' },
  { name: 'aces', type: 'u64' },
  { name: 'twelve', type: 'u64' },
  { name: 'pendingWinnings', type: 'u64' },
  { name: 'totalWagered', type: 'u64' },
  { name: 'totalWon', type: 'u64' },
  { name: 'totalLost', type: 'u64' },
  { name: 'lastUpdatedRound', type: 'u64' },
];

/**
 * Board account schema
 * Matches: api/src/state/board.rs
 */
export const BoardSchema: SchemaField[] = [
  { name: 'discriminator', type: 'u8' },
  { name: 'roundId', type: 'u64' },
  { name: 'startSlot', type: 'u64' },
  { name: 'endSlot', type: 'u64' },
];

/**
 * Round account schema
 * Matches: api/src/state/round.rs
 */
export const RoundSchema: SchemaField[] = [
  { name: 'discriminator', type: 'u8' },
  { name: 'id', type: 'u64' },
  { name: 'deployed', type: '[u64; 36]' },
  { name: 'slotHash', type: '[u8; 32]' },
  { name: 'count', type: '[u64; 36]' },
  { name: 'expiresAt', type: 'u64' },
  { name: 'motherlode', type: 'u64' },
  { name: 'rentPayer', type: 'publicKey' },
  { name: 'topMiner', type: 'publicKey' },
  { name: 'topMinerReward', type: 'u64' },
  { name: 'totalDeployed', type: 'u64' },
  { name: 'totalVaulted', type: 'u64' },
  { name: 'totalWinnings', type: 'u64' },
];

// Type definitions for parsed accounts
export interface CrapsGame {
  epochId: bigint;
  point: number;
  isComeOut: boolean;
  epochStartRound: bigint;
  houseBankroll: bigint;
  totalPayouts: bigint;
  totalCollected: bigint;
}

export interface CrapsPosition {
  authority: string;
  epochId: bigint;
  lastUpdatedRound: bigint;
  passLine: bigint;
  dontPass: bigint;
  passOdds: bigint;
  dontPassOdds: bigint;
  fieldBet: bigint;
  anySeven: bigint;
  anyCraps: bigint;
  yoEleven: bigint;
  aces: bigint;
  twelve: bigint;
  hardways: bigint[];
  placeBets: bigint[];
  placeWorking: boolean;
  comeBets: bigint[];
  comeOdds: bigint[];
  dontComeBets: bigint[];
  dontComeOdds: bigint[];
  pendingWinnings: bigint;
  totalWagered: bigint;
  totalWon: bigint;
  totalLost: bigint;
}

export interface Board {
  roundId: bigint;
  startSlot: bigint;
  endSlot: bigint;
}

export interface Round {
  id: bigint;
  deployed: bigint[];
  slotHash: Uint8Array;
  count: bigint[];
  expiresAt: bigint;
  motherlode: bigint;
  rentPayer: string;
  topMiner: string;
  topMinerReward: bigint;
  totalDeployed: bigint;
  totalVaulted: bigint;
  totalWinnings: bigint;
}
