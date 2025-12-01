/**
 * Program Instructions and Types - Migrated to Anza Kit
 *
 * This module provides program instruction builders and types.
 * Legacy web3.js compatibility is maintained for gradual migration.
 */

import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { address, type Address, getProgramDerivedAddress } from "@solana/kit";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  boardPDA,
  roundPDA,
  minerPDA,
  ORE_PROGRAM_ID,
  RNG_MINT,
  CRAP_MINT,
  ORE_PROGRAM_ADDRESS,
  RNG_MINT_ADDRESS,
  CRAP_MINT_ADDRESS,
} from "./solana";
import { squareToSum } from "./dice";

// ============================================================================
// PROGRAM IDs - Kit Address Type
// ============================================================================

// Entropy program ID using Kit Address type
export const ENTROPY_PROGRAM_ADDRESS: Address = address(
  "EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1"
);

// Legacy alias for backwards compatibility
export const ENTROPY_PROGRAM_ID = new PublicKey(
  "EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1"
);

// Instruction discriminators (matches OreInstruction enum from ore-api)
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
  Deposit = 10,
  Withdraw = 11,
  ClaimYield = 12,
  RecycleSOL = 21,
  StartRound = 22,
  // Craps instructions (CrapsGame is auto-created on first PlaceCrapsBet)
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
  // Bonus Craps (multi-roll side bets)
  BonusSmall = 16,
  BonusTall = 17,
  BonusAll = 18,
  // Come-out only side bets
  FireBet = 19,
  DiffDoubles = 20,
  RideTheLine = 21,
  MugsyCorner = 22,
  HotHand = 23,
  ReplayBet = 24,
  FieldersChoice = 25, // point = 0,1,2 for three sub-bets
  // True odds bets (0% house edge)
  Buy = 26,  // "Yes" bet - point before 7, pays true odds
  Lay = 27,  // "No" bet - 7 before point, pays inverse true odds
  Hop = 28,  // "Next" bet - single-roll bet on specific dice sum (2-12), true odds
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
  // True odds bets (0% house edge) - MUST be before hardways to match Rust struct
  yesBets: bigint[];    // 11 elements for sums 2-12 (index = sum-2), 7 is invalid
  noBets: bigint[];     // 11 elements for sums 2-12 (index = sum-2), 7 is invalid
  nextBets: bigint[];   // 11 elements for sums 2-12 (index = sum-2)
  // Hardways (4 elements for 4,6,8,10)
  hardways: bigint[];
  // Single-roll bets
  fieldBet: bigint;
  anySeven: bigint;
  anyCraps: bigint;
  yoEleven: bigint;
  aces: bigint;
  twelve: bigint;
  // Bonus craps side bets
  bonusSmall: bigint;   // wins if 2,3,4,5,6 all hit before 7
  bonusTall: bigint;    // wins if 8,9,10,11,12 all hit before 7
  bonusAll: bigint;     // wins if all 2-6 and 8-12 hit before 7
  smallHits: number;    // bitmask of small totals hit (bits 0-4 = 2,3,4,5,6)
  tallHits: number;     // bitmask of tall totals hit (bits 0-4 = 8,9,10,11,12)
  // Come-out only side bets
  fireBet: bigint;           // wins based on unique points made (4+ required)
  firePointsMade: number;    // bitmask of unique points made
  diffDoublesBet: bigint;    // wins based on unique doubles rolled
  diffDoublesHits: number;   // bitmask of unique doubles rolled
  rideTheLineBet: bigint;    // wins based on pass line wins before seven-out
  rideWinsCount: number;     // count of pass line wins
  mugsyBet: bigint;          // wins on 7 (different payouts based on phase)
  mugsyState: number;        // 0=come-out, 1=point phase, 2=resolved
  hotHandBet: bigint;        // wins if all 10 totals hit before 7
  hotHandHits: number;       // bitmask of totals hit (bits 0-9)
  replayBet: bigint;         // wins when same point made multiple times
  replayCounts: number[];    // count of times each point was made (6 elements)
  fieldersChoice: bigint[];  // 3 single-roll bets: [0]=2,3,4 | [1]=4,9,10 | [2]=10,11,12
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
  // Yes bets - sum before 7 (true odds = 6/ways_to_roll_sum)
  // Payout = 6:ways (since 7 has 6 ways)
  yes2: { num: 6, den: 1 },   // 6:1 (7 is 6x more likely than 2)
  yes3: { num: 3, den: 1 },   // 3:1 (7 is 3x more likely than 3)
  yes4: { num: 2, den: 1 },   // 2:1 (7 is 2x more likely than 4)
  yes5: { num: 3, den: 2 },   // 3:2 (7 is 1.5x more likely than 5)
  yes6: { num: 6, den: 5 },   // 6:5 (7 is 1.2x more likely than 6)
  yes8: { num: 6, den: 5 },   // 6:5 (same as 6)
  yes9: { num: 3, den: 2 },   // 3:2 (same as 5)
  yes10: { num: 2, den: 1 },  // 2:1 (same as 4)
  yes11: { num: 3, den: 1 },  // 3:1 (same as 3)
  yes12: { num: 6, den: 1 },  // 6:1 (same as 2)
  // No bets - 7 before sum (true odds = ways_to_roll_sum/6)
  // Payout = ways:6 (inverse of Yes)
  no2: { num: 1, den: 6 },    // 1:6 (bet 6 to win 1)
  no3: { num: 1, den: 3 },    // 1:3 (bet 3 to win 1)
  no4: { num: 1, den: 2 },    // 1:2 (bet 2 to win 1)
  no5: { num: 2, den: 3 },    // 2:3 (bet 3 to win 2)
  no6: { num: 5, den: 6 },    // 5:6 (bet 6 to win 5)
  no8: { num: 5, den: 6 },    // 5:6 (same as 6)
  no9: { num: 2, den: 3 },    // 2:3 (same as 5)
  no10: { num: 1, den: 2 },   // 1:2 (same as 4)
  no11: { num: 1, den: 3 },   // 1:3 (same as 3)
  no12: { num: 1, den: 6 },   // 1:6 (same as 2)
  // Next bets - specific sum on next roll (true odds = (36-ways)/ways)
  next2: { num: 35, den: 1 },   // 35:1 (1/36 probability)
  next3: { num: 17, den: 1 },   // 17:1 (2/36 probability)
  next4: { num: 11, den: 1 },   // 11:1 (3/36 probability)
  next5: { num: 8, den: 1 },    // 8:1 (4/36 probability)
  next6: { num: 31, den: 5 },   // 31:5 = 6.2:1 (5/36 probability)
  next7: { num: 5, den: 1 },    // 5:1 (6/36 probability)
  next8: { num: 31, den: 5 },   // 31:5 = 6.2:1 (5/36 probability)
  next9: { num: 8, den: 1 },    // 8:1 (4/36 probability)
  next10: { num: 11, den: 1 },  // 11:1 (3/36 probability)
  next11: { num: 17, den: 1 },  // 17:1 (2/36 probability)
  next12: { num: 35, den: 1 },  // 35:1 (1/36 probability)
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
 * Deploys RNG tokens to prospect on dice combinations.
 * Players stake RNG tokens to bet on dice outcomes and earn CRAP rewards.
 *
 * @param signer - The wallet signing and paying for the transaction
 * @param authority - The authority for the miner account (usually same as signer)
 * @param amount - Amount of RNG tokens to deploy (in base units with 9 decimals)
 * @param roundId - The current round ID
 * @param squares - Array of 36 booleans indicating selected dice combinations
 * @param dicePrediction - Dice sum prediction (0=safe mode, 2-12=bet on that sum). Default: 0
 */
export function createDeployInstruction(
  signer: PublicKey,
  authority: PublicKey,
  amount: bigint,
  roundId: bigint,
  squares: boolean[],
  dicePrediction: number = 0
): TransactionInstruction {
  const [automationAddress] = automationPDA(authority);
  const [boardAddress] = boardPDA();
  const [minerAddress] = minerPDA(authority);
  const [roundAddress] = roundPDA(roundId);
  const [entropyVarAddress] = entropyVarPDA(boardAddress, 0n);

  // RNG token accounts for transfer
  const signerRngAta = getAssociatedTokenAddressSync(RNG_MINT, signer);
  const roundRngAta = getAssociatedTokenAddressSync(RNG_MINT, roundAddress, true); // PDA owned

  // Build instruction data
  // Format: [discriminator (1)] [amount (8)] [squares mask (8)] [dice_prediction (1)] [padding (7)]
  // Total: 25 bytes (matches Rust Deploy struct)
  const mask = squaresToMask(squares);
  const data = new Uint8Array(25);
  data[0] = CrapsInstruction.Deploy;
  data.set(toLeBytes(amount, 8), 1);
  data.set(toLeBytes(mask, 8), 9);
  data[17] = dicePrediction;
  // bytes 18-24 are padding (already zero-initialized)

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      // Ore accounts (7)
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: authority, isSigner: false, isWritable: true },
      { pubkey: automationAddress, isSigner: false, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: minerAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // Token accounts (4) - for RNG transfer
      { pubkey: signerRngAta, isSigner: false, isWritable: true },
      { pubkey: roundRngAta, isSigner: false, isWritable: true },
      { pubkey: RNG_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      // Entropy accounts (2)
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
// INITIALIZE INSTRUCTION
// ============================================================================

/**
 * Build an Initialize instruction.
 * Creates Board, Config, Treasury, and Round 0 accounts.
 * Must be called once before any Deploy or other instructions can succeed.
 *
 * @param signer - The wallet initializing the program (becomes admin)
 */
export function createInitializeInstruction(
  signer: PublicKey
): TransactionInstruction {
  const [boardAddress] = boardPDA();
  const [configAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    ORE_PROGRAM_ID
  );
  const [treasuryAddress] = PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    ORE_PROGRAM_ID
  );
  const [roundAddress] = roundPDA(0n);

  const data = new Uint8Array(1);
  data[0] = OreInstruction.Initialize;

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: true },
      { pubkey: treasuryAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

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

// NOTE: CrapsGame account is auto-created on first PlaceCrapsBet - no InitCrapsGame instruction needed

// Craps Position PDA (per user)
export function crapsPositionPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

// Craps Vault PDA (token account authority)
export function crapsVaultPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_vault")],
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
 * Bets are placed using CRAP tokens.
 *
 * @param signer - The wallet placing the bet
 * @param betType - The type of craps bet
 * @param point - The point number (for Come/Place/Hardway bets)
 * @param amount - Amount in CRAP token base units (9 decimals)
 */
export function createPlaceCrapsBetInstruction(
  signer: PublicKey,
  betType: CrapsBetType,
  point: number,
  amount: bigint
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [crapsVaultAddress] = crapsVaultPDA();

  // CRAP token accounts
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, signer);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true); // PDA owned

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
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
 * Winnings are paid out in CRAP tokens.
 *
 * @param signer - The wallet claiming winnings
 */
export function createClaimCrapsWinningsInstruction(
  signer: PublicKey
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [crapsVaultAddress] = crapsVaultPDA();

  // CRAP token accounts
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, signer);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true); // PDA owned

  const data = new Uint8Array(1);
  data[0] = OreInstruction.ClaimCrapsWinnings;

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

/**
 * Build a FundCrapsHouse instruction.
 * Funds the house bankroll with CRAP tokens.
 *
 * @param signer - The wallet funding the house
 * @param amount - Amount in CRAP token base units (9 decimals)
 */
export function createFundCrapsHouseInstruction(
  signer: PublicKey,
  amount: bigint
): TransactionInstruction {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();

  // CRAP token accounts
  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, signer);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true); // PDA owned

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
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

// ============================================================================
// CRAPS ACCOUNT PARSING
// ============================================================================

// Minimum expected sizes for account validation (8-byte discriminator)
const CRAPS_GAME_MIN_SIZE = 8 + 8 + 1 + 1 + 6 + 8 + 8 + 8 + 8; // 64 bytes
// CrapsPosition: 864 bytes total (8 discriminator + 856 data)
const CRAPS_POSITION_MIN_SIZE = 864;

// Helper to read BigUInt64LE from any array-like data (works in browser & Node.js)
function readBigUInt64LE(data: Uint8Array | Buffer, offset: number): bigint {
  // Convert to Uint8Array if needed for consistent handling
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getBigUint64(offset, true); // true = little-endian
}

// Safe read helpers that return defaults when reading past end of data
function safeReadU64(data: Uint8Array | Buffer, offset: number): bigint {
  if (offset + 8 > data.length) return BigInt(0);
  return readBigUInt64LE(data, offset);
}

function safeReadU8(data: Uint8Array | Buffer, offset: number): number {
  if (offset >= data.length) return 0;
  return data[offset];
}

function safeReadU16LE(data: Uint8Array | Buffer, offset: number): number {
  if (offset + 2 > data.length) return 0;
  return data[offset] | (data[offset + 1] << 8);
}

// Parse CrapsGame account data
export function parseCrapsGame(data: Uint8Array | Buffer): CrapsGame {
  // SECURITY: Validate buffer length before parsing
  if (!data || data.length < CRAPS_GAME_MIN_SIZE) {
    throw new Error(`Invalid CrapsGame data: expected at least ${CRAPS_GAME_MIN_SIZE} bytes, got ${data?.length ?? 0}`);
  }

  // Skip discriminator (8 bytes - Anchor style)
  let offset = 8;

  const epochId = readBigUInt64LE(data, offset); offset += 8;
  const point = data[offset]; offset += 1;
  const isComeOut = data[offset] === 1; offset += 1;
  offset += 6; // padding
  const epochStartRound = readBigUInt64LE(data, offset); offset += 8;
  const houseBankroll = readBigUInt64LE(data, offset); offset += 8;
  const totalPayouts = readBigUInt64LE(data, offset); offset += 8;
  const totalCollected = readBigUInt64LE(data, offset); offset += 8;

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

// Legacy account size before yes/no/next bets were expanded to 11 elements
const CRAPS_POSITION_LEGACY_SIZE = 600;

// Create an empty CrapsPosition with all bets zeroed (for legacy account fallback)
function createEmptyPosition(authority: PublicKey, epochId: bigint): CrapsPosition {
  return {
    authority,
    epochId,
    passLine: BigInt(0),
    dontPass: BigInt(0),
    passOdds: BigInt(0),
    dontPassOdds: BigInt(0),
    comeBets: Array(NUM_POINTS).fill(BigInt(0)),
    comeOdds: Array(NUM_POINTS).fill(BigInt(0)),
    dontComeBets: Array(NUM_POINTS).fill(BigInt(0)),
    dontComeOdds: Array(NUM_POINTS).fill(BigInt(0)),
    placeBets: Array(NUM_POINTS).fill(BigInt(0)),
    placeWorking: false,
    yesBets: Array(11).fill(BigInt(0)),
    noBets: Array(11).fill(BigInt(0)),
    nextBets: Array(11).fill(BigInt(0)),
    hardways: Array(NUM_HARDWAYS).fill(BigInt(0)),
    fieldBet: BigInt(0),
    anySeven: BigInt(0),
    anyCraps: BigInt(0),
    yoEleven: BigInt(0),
    aces: BigInt(0),
    twelve: BigInt(0),
    bonusSmall: BigInt(0),
    bonusTall: BigInt(0),
    bonusAll: BigInt(0),
    smallHits: 0,
    tallHits: 0,
    fireBet: BigInt(0),
    firePointsMade: 0,
    diffDoublesBet: BigInt(0),
    diffDoublesHits: 0,
    rideTheLineBet: BigInt(0),
    rideWinsCount: 0,
    mugsyBet: BigInt(0),
    mugsyState: 0,
    hotHandBet: BigInt(0),
    hotHandHits: 0,
    replayBet: BigInt(0),
    replayCounts: Array(NUM_POINTS).fill(0),
    fieldersChoice: Array(3).fill(BigInt(0)),
    pendingWinnings: BigInt(0),
    totalWagered: BigInt(0),
    totalWon: BigInt(0),
    totalLost: BigInt(0),
    lastUpdatedRound: BigInt(0),
  };
}

// Parse CrapsPosition account data (matches Rust struct order exactly)
// For legacy accounts (<864 bytes), returns empty position that needs migration
export function parseCrapsPosition(data: Uint8Array | Buffer): CrapsPosition {
  // SECURITY: Validate minimum buffer length
  if (!data || data.length < 48) { // At least discriminator + authority + epoch_id
    throw new Error(`Invalid CrapsPosition data: expected at least 48 bytes, got ${data?.length ?? 0}`);
  }

  // Check if this is a legacy account that needs migration
  const isLegacyAccount = data.length < CRAPS_POSITION_MIN_SIZE;
  if (isLegacyAccount) {
    console.warn(`[CrapsPosition] Legacy account detected (${data.length} bytes). Returning empty position - account needs migration via close+recreate.`);
    // Return a mostly-empty position with just the authority and epoch from the old account
    const authority = new PublicKey(data.subarray(8, 40));
    const epochId = readBigUInt64LE(data, 40);
    return createEmptyPosition(authority, epochId);
  }

  // Skip discriminator (8 bytes - Anchor style)
  let offset = 8;

  const authority = new PublicKey(data.subarray(offset, offset + 32)); offset += 32;
  const epochId = readBigUInt64LE(data, offset); offset += 8;

  // Line bets
  const passLine = readBigUInt64LE(data, offset); offset += 8;
  const dontPass = readBigUInt64LE(data, offset); offset += 8;
  const passOdds = readBigUInt64LE(data, offset); offset += 8;
  const dontPassOdds = readBigUInt64LE(data, offset); offset += 8;

  // Come bets
  const comeBets: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    comeBets.push(readBigUInt64LE(data, offset)); offset += 8;
  }
  const comeOdds: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    comeOdds.push(readBigUInt64LE(data, offset)); offset += 8;
  }
  const dontComeBets: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    dontComeBets.push(readBigUInt64LE(data, offset)); offset += 8;
  }
  const dontComeOdds: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    dontComeOdds.push(readBigUInt64LE(data, offset)); offset += 8;
  }

  // Place bets
  const placeBets: bigint[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    placeBets.push(readBigUInt64LE(data, offset)); offset += 8;
  }
  const placeWorking = data[offset] === 1; offset += 1;
  offset += 7; // _padding1

  // True odds bets (Yes/No/Next) - 11 elements each for sums 2-12
  // NOTE: In Rust struct, these come BEFORE hardways
  const yesBets: bigint[] = [];
  for (let i = 0; i < 11; i++) {
    yesBets.push(readBigUInt64LE(data, offset)); offset += 8;
  }
  const noBets: bigint[] = [];
  for (let i = 0; i < 11; i++) {
    noBets.push(readBigUInt64LE(data, offset)); offset += 8;
  }
  const nextBets: bigint[] = [];
  for (let i = 0; i < 11; i++) {
    nextBets.push(readBigUInt64LE(data, offset)); offset += 8;
  }

  // Hardways (4 elements for hard 4, 6, 8, 10)
  const hardways: bigint[] = [];
  for (let i = 0; i < NUM_HARDWAYS; i++) {
    hardways.push(readBigUInt64LE(data, offset)); offset += 8;
  }

  // Single-roll bets
  const fieldBet = readBigUInt64LE(data, offset); offset += 8;
  const anySeven = readBigUInt64LE(data, offset); offset += 8;
  const anyCraps = readBigUInt64LE(data, offset); offset += 8;
  const yoEleven = readBigUInt64LE(data, offset); offset += 8;
  const aces = readBigUInt64LE(data, offset); offset += 8;
  const twelve = readBigUInt64LE(data, offset); offset += 8;

  // Bonus craps side bets
  const bonusSmall = readBigUInt64LE(data, offset); offset += 8;
  const bonusTall = readBigUInt64LE(data, offset); offset += 8;
  const bonusAll = readBigUInt64LE(data, offset); offset += 8;
  const smallHits = data[offset]; offset += 1;
  const tallHits = data[offset]; offset += 1;
  offset += 6; // _padding2

  // Fire Bet
  const fireBet = readBigUInt64LE(data, offset); offset += 8;
  const firePointsMade = data[offset]; offset += 1;
  offset += 7; // _pad_fire

  // Different Doubles Bet
  const diffDoublesBet = readBigUInt64LE(data, offset); offset += 8;
  const diffDoublesHits = data[offset]; offset += 1;
  offset += 7; // _pad_diff

  // Ride the Line Bet
  const rideTheLineBet = readBigUInt64LE(data, offset); offset += 8;
  const rideWinsCount = data[offset]; offset += 1;
  offset += 7; // _pad_ride

  // Mugsy's Corner Bet
  const mugsyBet = readBigUInt64LE(data, offset); offset += 8;
  const mugsyState = data[offset]; offset += 1;
  offset += 7; // _pad_mugsy

  // Hot Hand Bet
  const hotHandBet = readBigUInt64LE(data, offset); offset += 8;
  // Read 2 bytes for u16
  const hotHandHits = data[offset] | (data[offset + 1] << 8); offset += 2;
  offset += 6; // _pad_hot

  // Replay Bet
  const replayBet = readBigUInt64LE(data, offset); offset += 8;
  const replayCounts: number[] = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    replayCounts.push(data[offset]); offset += 1;
  }
  offset += 2; // _pad_replay

  // Fielder's Choice bets (3 single-roll bets)
  const fieldersChoice: bigint[] = [];
  for (let i = 0; i < 3; i++) {
    fieldersChoice.push(readBigUInt64LE(data, offset)); offset += 8;
  }

  // Tracking
  const pendingWinnings = readBigUInt64LE(data, offset); offset += 8;
  const totalWagered = readBigUInt64LE(data, offset); offset += 8;
  const totalWon = readBigUInt64LE(data, offset); offset += 8;
  const totalLost = readBigUInt64LE(data, offset); offset += 8;
  const lastUpdatedRound = readBigUInt64LE(data, offset); offset += 8;

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
    yesBets,
    noBets,
    nextBets,
    hardways,
    fieldBet,
    anySeven,
    anyCraps,
    yoEleven,
    aces,
    twelve,
    bonusSmall,
    bonusTall,
    bonusAll,
    smallHits,
    tallHits,
    fireBet,
    firePointsMade,
    diffDoublesBet,
    diffDoublesHits,
    rideTheLineBet,
    rideWinsCount,
    mugsyBet,
    mugsyState,
    hotHandBet,
    hotHandHits,
    replayBet,
    replayCounts,
    fieldersChoice,
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

// Get Yes bet payout ratio - true odds (0% house edge)
// Yes bets: chosen sum rolls before 7
export function getYesPayout(sum: number): { num: number; den: number } {
  switch (sum) {
    case 2: return CRAPS_PAYOUTS.yes2;
    case 3: return CRAPS_PAYOUTS.yes3;
    case 4: return CRAPS_PAYOUTS.yes4;
    case 5: return CRAPS_PAYOUTS.yes5;
    case 6: return CRAPS_PAYOUTS.yes6;
    case 8: return CRAPS_PAYOUTS.yes8;
    case 9: return CRAPS_PAYOUTS.yes9;
    case 10: return CRAPS_PAYOUTS.yes10;
    case 11: return CRAPS_PAYOUTS.yes11;
    case 12: return CRAPS_PAYOUTS.yes12;
    default: return { num: 0, den: 1 }; // 7 is invalid for Yes bets
  }
}

// Get No bet payout ratio - inverse true odds (0% house edge)
// No bets: 7 rolls before chosen sum
export function getNoPayout(sum: number): { num: number; den: number } {
  switch (sum) {
    case 2: return CRAPS_PAYOUTS.no2;
    case 3: return CRAPS_PAYOUTS.no3;
    case 4: return CRAPS_PAYOUTS.no4;
    case 5: return CRAPS_PAYOUTS.no5;
    case 6: return CRAPS_PAYOUTS.no6;
    case 8: return CRAPS_PAYOUTS.no8;
    case 9: return CRAPS_PAYOUTS.no9;
    case 10: return CRAPS_PAYOUTS.no10;
    case 11: return CRAPS_PAYOUTS.no11;
    case 12: return CRAPS_PAYOUTS.no12;
    default: return { num: 0, den: 1 }; // 7 is invalid for No bets
  }
}

// Get Next bet payout ratio - true odds based on sum probability (0% house edge)
// Next bets: single roll bet on specific sum
export function getNextPayout(sum: number): { num: number; den: number } {
  switch (sum) {
    case 2: return CRAPS_PAYOUTS.next2;
    case 3: return CRAPS_PAYOUTS.next3;
    case 4: return CRAPS_PAYOUTS.next4;
    case 5: return CRAPS_PAYOUTS.next5;
    case 6: return CRAPS_PAYOUTS.next6;
    case 7: return CRAPS_PAYOUTS.next7;
    case 8: return CRAPS_PAYOUTS.next8;
    case 9: return CRAPS_PAYOUTS.next9;
    case 10: return CRAPS_PAYOUTS.next10;
    case 11: return CRAPS_PAYOUTS.next11;
    case 12: return CRAPS_PAYOUTS.next12;
    default: return { num: 0, den: 1 };
  }
}

// ============================================================================
// KIT PDA DERIVATIONS (Async versions using @solana/kit)
// ============================================================================

/**
 * Convert bigint to little-endian Uint8Array for Kit PDA seeds
 */
function toKitLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

/**
 * Get Craps Game PDA using Kit (async)
 */
export async function getCrapsGamePDAKit(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("craps_game")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Craps Position PDA using Kit (async)
 */
export async function getCrapsPositionPDAKit(authority: Address): Promise<{ pda: Address; bump: number }> {
  const authorityBytes = new TextEncoder().encode(authority);
  const seeds = [
    new TextEncoder().encode("craps_position"),
    authorityBytes,
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Craps Vault PDA using Kit (async)
 */
export async function getCrapsVaultPDAKit(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("craps_vault")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Automation PDA using Kit (async)
 */
export async function getAutomationPDAKit(authority: Address): Promise<{ pda: Address; bump: number }> {
  const authorityBytes = new TextEncoder().encode(authority);
  const seeds = [
    new TextEncoder().encode("automation"),
    authorityBytes,
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Entropy Var PDA using Kit (async)
 */
export async function getEntropyVarPDAKit(board: Address, id: bigint): Promise<{ pda: Address; bump: number }> {
  const boardBytes = new TextEncoder().encode(board);
  const seeds = [
    new TextEncoder().encode("var"),
    boardBytes,
    toKitLeBytes(id, 8),
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ENTROPY_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Re-export Kit types for convenience
export { type Address } from "@solana/kit";

// Re-export Kit addresses from solana.ts
export { ORE_PROGRAM_ADDRESS, RNG_MINT_ADDRESS, CRAP_MINT_ADDRESS } from "./solana";
