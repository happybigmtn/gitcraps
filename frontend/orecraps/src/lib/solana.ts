import { PublicKey, Connection, clusterApiUrl, TransactionInstruction, SystemProgram } from "@solana/web3.js";

// Program IDs
// Devnet program ID - deployed for testing
export const ORE_PROGRAM_ID = new PublicKey(
  "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"
);
// Legacy ORE mint - not used in this game
// Users stake RNG tokens and earn CRAP tokens

// DEVNET TOKEN SYSTEM
// RNG token - staked to play games
// CRAP token - earned from OreCraps game
// Future games will also use RNG staking to earn their respective tokens

// Devnet token mints - created for testing
export const RNG_MINT = new PublicKey(
  "AG7WRHgsvg97pUT8wa59eFVmAf3UGLbxUpPRV4dGDaPc"
);
export const CRAP_MINT = new PublicKey(
  "5buiHDD8uGJFMfRU1wCF8Fcjxqr45SSrz9ErX65mJ6qS"
);

// Token decimals
export const TOKEN_DECIMALS = 11;
export const ONE_ORE = 100_000_000_000n; // 10^11

// RNG/CRAP decimals (devnet)
export const RNG_DECIMALS = 9;
export const CRAP_DECIMALS = 9;
export const ONE_RNG = 1_000_000_000n; // 10^9
export const ONE_CRAP = 1_000_000_000n; // 10^9

// Slot timing
export const SLOT_DURATION_MS = 400; // ~0.4 seconds per slot

// PDA derivations
export function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("board")],
    ORE_PROGRAM_ID
  );
}

export function roundPDA(roundId: bigint): [PublicKey, number] {
  // Convert bigint to little-endian Uint8Array (browser-compatible)
  const buffer = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number((roundId >> BigInt(8 * i)) & 0xffn);
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buffer],
    ORE_PROGRAM_ID
  );
}

export function minerPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("miner"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

export function treasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    ORE_PROGRAM_ID
  );
}

export function configPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    ORE_PROGRAM_ID
  );
}

// Connection helper
export function getConnection(network: "devnet" | "mainnet-beta" = "devnet") {
  return new Connection(clusterApiUrl(network), "confirmed");
}

// Format helpers
export function formatSol(lamports: bigint | number): string {
  const sol = Number(lamports) / 1e9;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatRng(amount: bigint | number): string {
  const rng = Number(amount) / Number(ONE_RNG);
  return rng.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatCrap(amount: bigint | number): string {
  const crap = Number(amount) / Number(ONE_CRAP);
  return crap.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / 1e9;
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1e9));
}

// Slot to time conversion
export function slotsToSeconds(slots: number): number {
  return (slots * SLOT_DURATION_MS) / 1000;
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Truncate address for display
export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Instruction discriminators
const INSTRUCTION_START_ROUND = 22;

// Helper to convert number to little-endian bytes
function toLEBytes(value: bigint | number, bytes: number): Uint8Array {
  const arr = new Uint8Array(bytes);
  let v = BigInt(value);
  for (let i = 0; i < bytes; i++) {
    arr[i] = Number(v & 0xffn);
    v = v >> 8n;
  }
  return arr;
}

// Build StartRound instruction
export function buildStartRoundInstruction(
  signer: PublicKey,
  roundId: bigint,
  duration: number = 3000 // Default 3000 slots (~20 minutes)
): TransactionInstruction {
  const [boardAddress] = boardPDA();
  const [configAddress] = configPDA();
  const [roundAddress] = roundPDA(roundId);

  // Instruction data: discriminator (1 byte) + duration (8 bytes LE)
  const data = new Uint8Array(9);
  data[0] = INSTRUCTION_START_ROUND;
  data.set(toLEBytes(duration, 8), 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}
