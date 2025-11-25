import {
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { boardPDA, roundPDA, minerPDA, ORE_PROGRAM_ID } from "./solana";

// Entropy program ID
export const ENTROPY_PROGRAM_ID = new PublicKey(
  "EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1"
);

// Instruction discriminators (matches OreInstruction enum)
export enum OreInstruction {
  Automate = 0,
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
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(id);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("var"), board.toBuffer(), buffer],
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

// Convert bigint to little-endian Uint8Array
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
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
  data[0] = OreInstruction.Deploy;
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
  data[0] = OreInstruction.Checkpoint;

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
  data[0] = OreInstruction.ClaimSOL;

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
export function lamportsToDisplay(lamports: bigint): string {
  const sol = Number(lamports) / LAMPORTS_PER_SOL;
  return sol.toFixed(4);
}

// BOARD_SIZE constant matching the program
export const BOARD_SIZE = 36;
