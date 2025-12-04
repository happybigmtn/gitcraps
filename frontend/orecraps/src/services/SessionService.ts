/**
 * SessionService - Manages session keys for gas-free transactions
 *
 * Session keys allow a delegate keypair to sign transactions on behalf of the user
 * for a limited time (up to 24 hours). The delegate cannot perform withdrawals.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";

// Program ID for the ORE program
const ORE_PROGRAM_ID = new PublicKey(
  "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"
);

// Instruction discriminators
const CREATE_SESSION = 88;
const REVOKE_SESSION = 89;

// Session operation flags
export enum SessionOperation {
  Games = 0,
  Swaps = 1,
  StakingDeposit = 2,
  Mining = 3,
}

// Session PDA seed
const SESSION_SEED = "session";

// Max session duration: 24 hours in seconds
export const MAX_SESSION_DURATION = 24 * 60 * 60;

export interface SessionInfo {
  authority: PublicKey;
  delegate: PublicKey;
  expiresAt: number;
  createdAt: number;
  allowedOperations: bigint;
  pda: PublicKey;
}

export interface StoredSession {
  delegatePrivateKey: Uint8Array;
  authority: string;
  expiresAt: number;
  createdAt: number;
  allowedOperations: number;
}

/**
 * Derive the session PDA for a user.
 */
export function getSessionPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SESSION_SEED), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

/**
 * Write a 64-bit unsigned integer as little-endian bytes.
 * Browser-compatible alternative to Buffer.writeBigUInt64LE.
 */
function writeBigUInt64LE(buffer: Buffer, value: bigint, offset: number): void {
  const low = Number(value & 0xffffffffn);
  const high = Number((value >> 32n) & 0xffffffffn);
  buffer.writeUInt32LE(low, offset);
  buffer.writeUInt32LE(high, offset + 4);
}

/**
 * Read a 64-bit signed integer as little-endian bytes.
 * Browser-compatible alternative to Buffer.readBigInt64LE.
 */
function readBigInt64LE(buffer: Buffer, offset: number): bigint {
  const low = buffer.readUInt32LE(offset);
  const high = buffer.readInt32LE(offset + 4);
  return BigInt(low) | (BigInt(high) << 32n);
}

/**
 * Read a 64-bit unsigned integer as little-endian bytes.
 * Browser-compatible alternative to Buffer.readBigUInt64LE.
 */
function readBigUInt64LE(buffer: Buffer, offset: number): bigint {
  const low = buffer.readUInt32LE(offset);
  const high = buffer.readUInt32LE(offset + 4);
  return BigInt(low) | (BigInt(high) << 32n);
}

/**
 * Create a session key for gas-free transactions.
 * Returns the delegate keypair that should be stored securely.
 */
export function buildCreateSessionInstruction(
  authority: PublicKey,
  payer: PublicKey,
  delegate: PublicKey,
  durationSeconds: number = MAX_SESSION_DURATION,
  allowedOperations: bigint = getAllOperations()
): TransactionInstruction {
  const [sessionPDA] = getSessionPDA(authority);

  // Build instruction data:
  // 1 byte: discriminator (88)
  // 32 bytes: delegate pubkey
  // 8 bytes: duration (little-endian)
  // 8 bytes: allowed operations (little-endian)
  const data = Buffer.alloc(1 + 32 + 8 + 8);
  data.writeUInt8(CREATE_SESSION, 0);
  delegate.toBuffer().copy(data, 1);
  writeBigUInt64LE(data, BigInt(durationSeconds), 33);
  writeBigUInt64LE(data, allowedOperations, 41);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: sessionPDA, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Revoke an existing session.
 */
export function buildRevokeSessionInstruction(
  authority: PublicKey,
  payer: PublicKey
): TransactionInstruction {
  const [sessionPDA] = getSessionPDA(authority);

  // Build instruction data:
  // 1 byte: discriminator (89)
  const data = Buffer.alloc(1);
  data.writeUInt8(REVOKE_SESSION, 0);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: sessionPDA, isSigner: false, isWritable: true },
      { pubkey: payer, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Get all allowed operations bitmask (excludes withdrawals).
 */
export function getAllOperations(): bigint {
  return (
    (1n << BigInt(SessionOperation.Games)) |
    (1n << BigInt(SessionOperation.Swaps)) |
    (1n << BigInt(SessionOperation.StakingDeposit)) |
    (1n << BigInt(SessionOperation.Mining))
  );
}

/**
 * Check if an operation is allowed by the bitmask.
 */
export function isOperationAllowed(
  allowedOps: bigint,
  op: SessionOperation
): boolean {
  return (allowedOps & (1n << BigInt(op))) !== 0n;
}

/**
 * Fetch session info from chain.
 */
export async function fetchSession(
  connection: Connection,
  authority: PublicKey
): Promise<SessionInfo | null> {
  const [sessionPDA] = getSessionPDA(authority);

  try {
    const accountInfo = await connection.getAccountInfo(sessionPDA);
    if (!accountInfo || accountInfo.data.length === 0) {
      return null;
    }

    // Parse session account data
    // Skip 8 byte discriminator
    const rawData = accountInfo.data;
    if (rawData.length < 8 + 32 + 32 + 8 + 8 + 8) {
      return null;
    }

    // Convert to Buffer for consistent reading
    const data = Buffer.from(rawData);
    const authorityBytes = data.slice(8, 40);
    const delegateBytes = data.slice(40, 72);
    const expiresAt = Number(readBigInt64LE(data, 72));
    const createdAt = Number(readBigInt64LE(data, 80));
    const allowedOperations = readBigUInt64LE(data, 88);

    return {
      authority: new PublicKey(authorityBytes),
      delegate: new PublicKey(delegateBytes),
      expiresAt,
      createdAt,
      allowedOperations,
      pda: sessionPDA,
    };
  } catch (error) {
    console.error("Error fetching session:", error);
    return null;
  }
}

/**
 * Check if a session is still valid (not expired).
 */
export function isSessionValid(session: SessionInfo | null): boolean {
  if (!session) return false;
  const now = Math.floor(Date.now() / 1000);
  return now < session.expiresAt;
}

/**
 * Generate a new delegate keypair for session use.
 */
export function generateDelegateKeypair(): Keypair {
  return Keypair.generate();
}

// ============================================================================
// LOCAL STORAGE FOR SESSION KEYS
// ============================================================================

const SESSION_STORAGE_KEY = "orecraps_session";

/**
 * Store a session and its delegate keypair in local storage.
 * WARNING: This stores the private key in browser storage.
 * For production, consider more secure alternatives.
 */
export function storeSession(
  delegateKeypair: Keypair,
  authority: PublicKey,
  expiresAt: number,
  allowedOperations: bigint
): void {
  const stored: StoredSession = {
    delegatePrivateKey: Array.from(delegateKeypair.secretKey) as unknown as Uint8Array,
    authority: authority.toBase58(),
    expiresAt,
    createdAt: Math.floor(Date.now() / 1000),
    allowedOperations: Number(allowedOperations),
  };

  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
  } catch (error) {
    console.error("Failed to store session:", error);
  }
}

/**
 * Load a stored session from local storage.
 */
export function loadStoredSession(): {
  keypair: Keypair;
  authority: PublicKey;
  expiresAt: number;
} | null {
  try {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return null;

    const parsed: StoredSession = JSON.parse(stored);

    // Check if expired
    const now = Math.floor(Date.now() / 1000);
    if (now >= parsed.expiresAt) {
      clearStoredSession();
      return null;
    }

    const keypair = Keypair.fromSecretKey(new Uint8Array(parsed.delegatePrivateKey as unknown as number[]));
    const authority = new PublicKey(parsed.authority);

    return {
      keypair,
      authority,
      expiresAt: parsed.expiresAt,
    };
  } catch (error) {
    console.error("Failed to load stored session:", error);
    clearStoredSession();
    return null;
  }
}

/**
 * Clear stored session from local storage.
 */
export function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
}

/**
 * Format remaining session time as human-readable string.
 */
export function formatSessionTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = expiresAt - now;

  if (remaining <= 0) return "Expired";

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
