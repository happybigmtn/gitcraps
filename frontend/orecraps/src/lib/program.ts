import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { boardPDA, roundPDA, minerPDA, ORE_PROGRAM_ID } from "./solana";
import { squareToSum } from "./dice";

// Entropy program ID
export const ENTROPY_PROGRAM_ID = new PublicKey(
  "EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1"
);

// Instruction discriminators (matches OreInstruction enum)
export enum OreInstruction {
  Automate = 0,
  Initialize = 1,
  Checkpoint = 2,
  ClaimSOL = 3,
  ClaimORE = 4,
  Close = 5,
  Deploy = 6,
  Log = 8,
  Reset = 9,
  RecycleSOL = 21,
  Deposit = 10,
  Withdraw = 11,
  ClaimYield = 12,
  // Craps instructions
  PlaceCrapsBet = 23,
  SettleCraps = 24,
  ClaimCrapsWinnings = 25,
  FundCrapsHouse = 26,
}

// Backwards compatibility alias
export const CrapsInstruction = OreInstruction;

// ============================================================================
// CRAPS BET TYPES
// ============================================================================

export enum CrapsBetType {
  // Line bets
  PassLine = 0,
  DontPass = 1,
  PassOdds = 2,
  DontPassOdds = 3,
  // Come bets
  Come = 4,
  DontCome = 5,
  ComeOdds = 6,
  DontComeOdds = 7,
  // Place bets
  Place = 8,
  // Hardways
  Hardway = 9,
  // Single-roll bets
  Field = 10,
  AnySeven = 11,
  AnyCraps = 12,
  YoEleven = 13,
  Aces = 14,
  Twelve = 15,
}

// Number of points (4, 5, 6, 8, 9, 10)
export const NUM_POINTS = 6;
export const NUM_HARDWAYS = 4;

// Point numbers in order
export const POINT_NUMBERS = [4, 5, 6, 8, 9, 10];
export const HARDWAY_NUMBERS = [4, 6, 8, 10];

// Craps game state (matches on-chain CrapsGame struct)
export interface CrapsGame {
  epochId: bigint;
  point: number;
  isComeOut: boolean;
  epochStartRound: bigint;
  houseBankroll: bigint;
  totalPayouts: bigint;
  totalCollected: bigint;
}

// Craps position state (matches on-chain CrapsPosition struct)
export interface CrapsPosition {
  authority: PublicKey;
  epochId: bigint;
  // Line bets
  passLine: bigint;
  dontPass: bigint;
  passOdds: bigint;
  dontPassOdds: bigint;
  // Come bets (6 elements for points 4,5,6,8,9,10)
  comeBets: bigint[];
  comeOdds: bigint[];
  dontComeBets: bigint[];
  dontComeOdds: bigint[];
  // Place bets
  placeBets: bigint[];
  placeWorking: boolean;
  // Hardways (4 elements for 4,6,8,10)
  hardways: bigint[];
  // Single-roll bets
  fieldBet: bigint;
  anySeven: bigint;
  anyCraps: bigint;
  yoEleven: bigint;
  aces: bigint;
  twelve: bigint;
  // Tracking
  pendingWinnings: bigint;
  totalWagered: bigint;
  totalWon: bigint;
  totalLost: bigint;
  lastUpdatedRound: bigint;
}

// Payout constants (matching on-chain)
export const CRAPS_PAYOUTS = {
  passLine: { num: 1, den: 1 },
  dontPass: { num: 1, den: 1 },
  field: { normal: { num: 1, den: 1 }, special: { num: 2, den: 1 } }, // 2x on 2/12
  anySeven: { num: 4, den: 1 },
  anyCraps: { num: 7, den: 1 },
  yoEleven: { num: 15, den: 1 },
  aces: { num: 30, den: 1 },
  twelve: { num: 30, den: 1 },
  place4_10: { num: 9, den: 5 },
  place5_9: { num: 7, den: 5 },
  place6_8: { num: 7, den: 6 },
  trueOdds4_10: { num: 2, den: 1 },
  trueOdds5_9: { num: 3, den: 2 },
  trueOdds6_8: { num: 6, den: 5 },
  hard4_10: { num: 7, den: 1 },
  hard6_8: { num: 9, den: 1 },
};

// Convert bigint to little-endian Uint8Array
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

// Automation PDA
export function automationPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("automation"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

// Entropy Var PDA
export function entropyVarPDA(board: PublicKey, id: bigint): [PublicKey, number] {
  const idBytes = toLeBytes(id, 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("var"), board.toBuffer(), idBytes],
    ENTROPY_PROGRAM_ID
  );
}

// Convert boolean array to 64-bit bitmask
export function squaresToMask(squares: boolean[]): bigint {
  let mask = 0n;
  for (let i = 0; i < Math.min(squares.length, 64); i++) {
    if (squares[i]) {
      mask |= 1n << BigInt(i);
    }
  }
  return mask;
}

/**
 * Build a Deploy instruction.
 *
 * @param signer - The wallet signing and paying for the transaction
 * @param authority - The authority for the miner account (usually same as signer)
 * @param amount - Amount in lamports to deploy per selected square
 * @param roundId - The current round ID
 * @param squares - Array of 36 booleans indicating selected dice combinations
 */
export function createDeployInstruction(
  signer: PublicKey,
  authority: PublicKey,
  amount: bigint,
  roundId: bigint,
  squares: boolean[]
): TransactionInstruction {
  const [automationAddress] = automationPDA(authority);
  const [boardAddress] = boardPDA();
  const [minerAddress] = minerPDA(authority);
  const [roundAddress] = roundPDA(roundId);
  const [entropyVarAddress] = entropyVarPDA(boardAddress, 0n);

  // Build instruction data
  // Format: [discriminator (1 byte)] [amount (8 bytes)] [squares mask (8 bytes)]
  const mask = squaresToMask(squares);
  const data = new Uint8Array(17);
  data[0] = CrapsInstruction.Deploy;
  data.set(toLeBytes(amount, 8), 1);
  data.set(toLeBytes(mask, 8), 9);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: true },
      { pubkey: automationAddress, isSigner: false, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: minerAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // Entropy accounts
      { pubkey: entropyVarAddress, isSigner: false, isWritable: true },
      { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a Checkpoint instruction.
 */
export function createCheckpointInstruction(
  signer: PublicKey,
  authority: PublicKey,
  roundId: bigint
): TransactionInstruction {
  const [minerAddress] = minerPDA(authority);
  const [boardAddress] = boardPDA();
  const [roundAddress] = roundPDA(roundId);

  // Treasury PDA
  const [treasuryAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    ORE_PROGRAM_ID
  );

  const data = new Uint8Array(1);
  data[0] = CrapsInstruction.Checkpoint;

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: minerAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
      { pubkey: treasuryAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a ClaimSOL instruction.
 */
export function createClaimSOLInstruction(
  signer: PublicKey
): TransactionInstruction {
  const [minerAddress] = minerPDA(signer);

  const data = new Uint8Array(1);
  data[0] = CrapsInstruction.ClaimSOL;

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: minerAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

// Helper to parse lamports to SOL display
// FIXED: Use string-based division to avoid BigInt precision loss for large values
export function lamportsToDisplay(lamports: bigint): string {
  // Convert to string to preserve precision for values > Number.MAX_SAFE_INTEGER
  const lamportsStr = lamports.toString();
  const paddedStr = lamportsStr.padStart(10, '0'); // Pad to at least 10 digits (1 SOL = 1e9 lamports)

  // Split into whole SOL and fractional parts
  const splitIndex = paddedStr.length - 9; // 9 decimal places for lamports
  const wholePart = paddedStr.slice(0, splitIndex) || '0';
  const fractionalPart = paddedStr.slice(splitIndex);

  // Format with 4 decimal places
  const truncatedFractional = fractionalPart.slice(0, 4).padEnd(4, '0');
  return `${wholePart}.${truncatedFractional}`;
}

// BOARD_SIZE constant matching the program
export const BOARD_SIZE = 36;

// ============================================================================
// CRAPS PDAs AND INSTRUCTIONS
// ============================================================================

// Craps Game PDA (singleton)
export function crapsGamePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
    ORE_PROGRAM_ID
  );
}

// Craps Position PDA (per user)
export function crapsPositionPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

// Convert point number to array index
export function pointToIndex(point: number): number | null {
  switch (point) {
    case 4: return 0;
    case 5: return 1;
    case 6: return 2;
    case 8: return 3;
    case 9: return 4;
    case 10: return 5;
    default: return null;
  }
}

// Convert array index to point number
export function indexToPoint(index: number): number | null {
  switch (index) {
    case 0: return 4;
    case 1: return 5;
    case 2: return 6;
    case 3: return 8;
    case 4: return 9;
    case 5: return 10;
    default: return null;
  }
}

// Convert hardway number to array index
export function hardwayToIndex(hardway: number): number | null {
  switch (hardway) {
    case 4: return 0;
    case 6: return 1;
    case 8: return 2;
    case 10: return 3;
    default: return null;
  }
}

/**
 * Build a PlaceCrapsBet instruction.
 *
 * @param signer - The wallet placing the bet
 * @param betType - The type of craps bet
 * @param point - The point number (for Come/Place/Hardway bets)
 * @param amount - Amount in lamports
 */
export function createPlaceCrapsBetInstruction(
  signer: PublicKey,
  betType: CrapsBetType,
  point: number,
  amount: bigint
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);

  // Build instruction data
  // Format: [discriminator (1 byte)] [bet_type (1 byte)] [point (1 byte)] [padding (6 bytes)] [amount (8 bytes)]
  const data = new Uint8Array(17);
  data[0] = OreInstruction.PlaceCrapsBet;
  data[1] = betType;
  data[2] = point;
  // data[3-8] = padding (zeros)
  data.set(toLeBytes(amount, 8), 9);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a SettleCraps instruction.
 *
 * @param signer - The wallet settling their bets
 * @param winningSquare - The winning square from the round
 * @param roundId - The round ID for verification
 */
export function createSettleCrapsInstruction(
  signer: PublicKey,
  winningSquare: bigint,
  roundId: bigint
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [roundAddress] = roundPDA(roundId);

  // Build instruction data
  // Format: [discriminator (1 byte)] [winning_square (8 bytes)]
  const data = new Uint8Array(9);
  data[0] = OreInstruction.SettleCraps;
  data.set(toLeBytes(winningSquare, 8), 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a ClaimCrapsWinnings instruction.
 *
 * @param signer - The wallet claiming winnings
 */
export function createClaimCrapsWinningsInstruction(
  signer: PublicKey
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);

  const data = new Uint8Array(1);
  data[0] = OreInstruction.ClaimCrapsWinnings;

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a FundCrapsHouse instruction.
 *
 * @param signer - The wallet funding the house
 * @param amount - Amount in lamports
 */
export function createFundCrapsHouseInstruction(
  signer: PublicKey,
  amount: bigint
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();

  // Build instruction data
  // Format: [discriminator (1 byte)] [amount (8 bytes)]
  const data = new Uint8Array(9);
  data[0] = OreInstruction.FundCrapsHouse;
  data.set(toLeBytes(amount, 8), 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

// ============================================================================
// CRAPS ACCOUNT PARSING
// ============================================================================

// Minimum expected sizes for account validation
const CRAPS_GAME_MIN_SIZE = 1 + 8 + 1 + 1 + 6 + 8 + 8 + 8 + 8; // ~57 bytes
const CRAPS_POSITION_MIN_SIZE = 1 + 32 + 8 + (8 * 4) + (8 * 6 * 4) + (8 * 6) + 1 + 7 + (8 * 4) + (8 * 6) + (8 * 5); // ~497 bytes

// Parse CrapsGame account data
export function parseCrapsGame(data: Buffer): CrapsGame {
  // SECURITY: Validate buffer length before parsing
  if (!data || data.length < CRAPS_GAME_MIN_SIZE) {
    throw new Error(`Invalid CrapsGame data: expected at least ${CRAPS_GAME_MIN_SIZE} bytes, got ${data?.length ?? 0}`);
  }

  // Skip discriminator (1 byte)
  let offset = 1;

  const epochId = data.readBigUInt64LE(offset); offset += 8;
  const point = data[offset]; offset += 1;
  const isComeOut = data[offset] === 1; offset += 1;
  offset += 6; // padding
  const epochStartRound = data.readBigUInt64LE(offset); offset += 8;
  const houseBankroll = data.readBigUInt64LE(offset); offset += 8;
  const totalPayouts = data.readBigUInt64LE(offset); offset += 8;
  const totalCollected = data.readBigUInt64LE(offset); offset += 8;

  return {
    epochId,
    point,
    isComeOut,
    epochStartRound,
    houseBankroll,
    totalPayouts,
    totalCollected,
  };
}

// Parse CrapsPosition account data
export function parseCrapsPosition(data: Buffer): CrapsPosition {
  // SECURITY: Validate buffer length before parsing
  if (!data || data.length < CRAPS_POSITION_MIN_SIZE) {
    throw new Error(`Invalid CrapsPosition data: expected at least ${CRAPS_POSITION_MIN_SIZE} bytes, got ${data?.length ?? 0}`);
  }

  // Skip discriminator (1 byte)
  let offset = 1;

  const authority = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const epochId = data.readBigUInt64LE(offset); offset += 8;

  // Line bets
  const passLine = data.readBigUInt64LE(offset); offset += 8;
  const dontPass = data.readBigUInt64LE(offset); offset += 8;
  const passOdds = data.readBigUInt64LE(offset); offset += 8;
  const dontPassOdds = data.readBigUInt64LE(offset); offset += 8;

  // Come bets
  const comeBets: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    comeBets.push(data.readBigUInt64LE(offset)); offset += 8;
  }
  const comeOdds: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    comeOdds.push(data.readBigUInt64LE(offset)); offset += 8;
  }
  const dontComeBets: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    dontComeBets.push(data.readBigUInt64LE(offset)); offset += 8;
  }
  const dontComeOdds: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    dontComeOdds.push(data.readBigUInt64LE(offset)); offset += 8;
  }

  // Place bets
  const placeBets: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    placeBets.push(data.readBigUInt64LE(offset)); offset += 8;
  }
  const placeWorking = data[offset] === 1; offset += 1;
  offset += 7; // padding

  // Hardways
  const hardways: bigint[] = [];
  for (let i = 0; i < NUM_HARDWAYS; i++) {
    hardways.push(data.readBigUInt64LE(offset)); offset += 8;
  }

  // Single-roll bets
  const fieldBet = data.readBigUInt64LE(offset); offset += 8;
  const anySeven = data.readBigUInt64LE(offset); offset += 8;
  const anyCraps = data.readBigUInt64LE(offset); offset += 8;
  const yoEleven = data.readBigUInt64LE(offset); offset += 8;
  const aces = data.readBigUInt64LE(offset); offset += 8;
  const twelve = data.readBigUInt64LE(offset); offset += 8;

  // Tracking
  const pendingWinnings = data.readBigUInt64LE(offset); offset += 8;
  const totalWagered = data.readBigUInt64LE(offset); offset += 8;
  const totalWon = data.readBigUInt64LE(offset); offset += 8;
  const totalLost = data.readBigUInt64LE(offset); offset += 8;
  const lastUpdatedRound = data.readBigUInt64LE(offset); offset += 8;

  return {
    authority,
    epochId,
    passLine,
    dontPass,
    passOdds,
    dontPassOdds,
    comeBets,
    comeOdds,
    dontComeBets,
    dontComeOdds,
    placeBets,
    placeWorking,
    hardways,
    fieldBet,
    anySeven,
    anyCraps,
    yoEleven,
    aces,
    twelve,
    pendingWinnings,
    totalWagered,
    totalWon,
    totalLost,
    lastUpdatedRound,
  };
}

// ============================================================================
// CRAPS UTILITY FUNCTIONS
// ============================================================================

// Convert dice roll (square) to sum
// Note: This function now wraps the shared utility for backwards compatibility
export function squareToDiceSum(square: number): number {
  if (square < 0 || square >= BOARD_SIZE) return 0;
  return squareToSum(square);
}

// Check if square is a hardway (doubles)
export function isHardway(square: number): boolean {
  return square >= 0 && square < BOARD_SIZE && square % 7 === 0;
}

// Check if sum is craps (2, 3, or 12)
export function isCraps(sum: number): boolean {
  return sum === 2 || sum === 3 || sum === 12;
}

// Check if sum is natural (7 or 11)
export function isNatural(sum: number): boolean {
  return sum === 7 || sum === 11;
}

// Check if sum is a point number
export function isPointNumber(sum: number): boolean {
  return [4, 5, 6, 8, 9, 10].includes(sum);
}

// Check if sum wins field bet
export function isFieldWinner(sum: number): boolean {
  return [2, 3, 4, 9, 10, 11, 12].includes(sum);
}

// Calculate payout for a winning bet
export function calculatePayout(betAmount: bigint, payoutNum: bigint, payoutDen: bigint): bigint {
  return (betAmount * payoutNum) / payoutDen;
}

// Get place bet payout ratio
export function getPlacePayout(point: number): { num: number; den: number } {
  switch (point) {
    case 4:
    case 10:
      return CRAPS_PAYOUTS.place4_10;
    case 5:
    case 9:
      return CRAPS_PAYOUTS.place5_9;
    case 6:
    case 8:
      return CRAPS_PAYOUTS.place6_8;
    default:
      return { num: 0, den: 1 };
  }
}

// Get true odds payout ratio
export function getTrueOddsPayout(point: number): { num: number; den: number } {
  switch (point) {
    case 4:
    case 10:
      return CRAPS_PAYOUTS.trueOdds4_10;
    case 5:
    case 9:
      return CRAPS_PAYOUTS.trueOdds5_9;
    case 6:
    case 8:
      return CRAPS_PAYOUTS.trueOdds6_8;
    default:
      return { num: 0, den: 1 };
  }
}

// Get hardway payout ratio
export function getHardwayPayout(hardway: number): { num: number; den: number } {
  switch (hardway) {
    case 4:
    case 10:
      return CRAPS_PAYOUTS.hard4_10;
    case 6:
    case 8:
      return CRAPS_PAYOUTS.hard6_8;
    default:
      return { num: 0, den: 1 };
  }
}
