/**
 * Entropy Provider API for Localnet Testing
 *
 * This endpoint manages the full entropy lifecycle for on-chain dice rolls:
 * 1. Open - Initialize Var account with commit
 * 2. Sample - Capture slot_hash
 * 3. Reveal - Disclose seed, compute final value
 *
 * POST /api/entropy
 * Body: { action: "open" | "sample" | "reveal" | "full-cycle", network: "localnet" }
 */

import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import { createDebugger } from "@/lib/debug";
import { validateAdminToken } from "@/lib/adminAuth";
import { apiLimiter } from "@/lib/rateLimit";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { keccak256 as keccak256Hash } from "js-sha3";
import { ORE_PROGRAM_ID, ENTROPY_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "@/lib/constants";

const debug = createDebugger("EntropyAPI");

const LOCALNET_RPC = "http://127.0.0.1:8899";

// Ore instruction discriminator for new_var
const ORE_NEW_VAR = 19;

/**
 * Load the admin keypair from the Solana config directory
 */
function loadAdminKeypair(): Keypair {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH ||
    path.join(os.homedir(), ".config", "solana", "id.json");

  try {
    const secretKey = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
    return Keypair.fromSecretKey(new Uint8Array(secretKey));
  } catch (error) {
    debug(`Failed to load keypair from ${keypairPath}:`, error);
    throw new Error(`Cannot load admin keypair from ${keypairPath}`);
  }
}

// Instruction discriminators
const ENTROPY_OPEN = 0;
const ENTROPY_SAMPLE = 5;
const ENTROPY_REVEAL = 4;

// In-memory seed storage (for localnet testing only)
const seedStorage = new Map<string, Buffer>();

// Counter for unique var IDs
let varIdCounter = 0n;

// Var account offsets (8-byte discriminator prefix)
const VAR_OFFSETS = {
  discriminator: 0,  // 8 bytes
  authority: 8,      // 32 bytes
  id: 40,            // 8 bytes
  provider: 48,      // 32 bytes
  commit: 80,        // 32 bytes
  seed: 112,         // 32 bytes
  slot_hash: 144,    // 32 bytes
  value: 176,        // 32 bytes
  samples: 208,      // 8 bytes
  is_auto: 216,      // 8 bytes
  start_at: 224,     // 8 bytes
  end_at: 232,       // 8 bytes
};                   // Total: 240 bytes

function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

function readU64(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(data[offset + i]) << BigInt(8 * i);
  }
  return value;
}

function keccak256(data: Buffer): Buffer {
  // Use proper Keccak256 (Ethereum/Solana style), NOT SHA3-256
  const hashHex = keccak256Hash(data);
  return Buffer.from(hashHex, "hex");
}

function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function configPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID);
}

function varPDA(authority: PublicKey, id: bigint): [PublicKey, number] {
  const idBytes = toLeBytes(id, 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("var"), authority.toBuffer(), idBytes],
    ENTROPY_PROGRAM_ID
  );
}

/**
 * Parse Var account data
 */
function parseVarAccount(data: Uint8Array) {
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
 * Build NewVar instruction (calls ore program which does CPI to entropy Open)
 * Args: NewVar { id: [u8; 8], commit: [u8; 32], samples: [u8; 8] }
 */
function buildNewVarInstruction(
  signer: PublicKey,
  boardAddress: PublicKey,
  configAddress: PublicKey,
  provider: PublicKey,
  varAddress: PublicKey,
  id: bigint,
  commit: Buffer,
  samples: bigint
) {
  // Data format: discriminator (1) + id (8) + commit (32) + samples (8) = 49 bytes
  const data = Buffer.alloc(49);
  data[0] = ORE_NEW_VAR;
  data.set(toLeBytes(id, 8), 1);
  commit.copy(data, 9);
  data.set(toLeBytes(samples, 8), 41);

  return {
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: provider, isSigner: false, isWritable: false },
      { pubkey: varAddress, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  };
}

/**
 * Build Sample instruction
 */
function buildSampleInstruction(signer: PublicKey, varAddress: PublicKey) {
  const data = Buffer.alloc(1);
  data[0] = ENTROPY_SAMPLE;

  return {
    programId: ENTROPY_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: varAddress, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  };
}

/**
 * Build Reveal instruction
 */
function buildRevealInstruction(signer: PublicKey, varAddress: PublicKey, seed: Buffer) {
  const data = Buffer.alloc(33);
  data[0] = ENTROPY_REVEAL;
  seed.copy(data, 1);

  return {
    programId: ENTROPY_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: varAddress, isSigner: false, isWritable: true },
    ],
    data,
  };
}

/**
 * Calculate dice result from value
 */
function calculateDiceFromValue(value: Buffer): {
  die1: number;
  die2: number;
  sum: number;
  winningSquare: number;
} {
  const sample = readU64(new Uint8Array(value), 0);
  const boardSize = 36n;
  const maxValid = (0xffffffffffffffffn / boardSize) * boardSize;

  let winningSquare: number;
  if (sample < maxValid) {
    winningSquare = Number(sample % boardSize);
  } else {
    const rehash = keccak256(value);
    const sample2 = readU64(new Uint8Array(rehash), 0);
    winningSquare = Number(sample2 % boardSize);
  }

  const die1 = Math.floor(winningSquare / 6) + 1;
  const die2 = (winningSquare % 6) + 1;
  const sum = die1 + die2;

  return { die1, die2, sum, winningSquare };
}

/**
 * Build Open instruction (direct entropy program call)
 * Note: This is only used in the "open" action. The "full-cycle" uses NewVar instead.
 */
function buildOpenInstruction(
  authority: PublicKey,
  signer: PublicKey,
  provider: PublicKey,
  varAddress: PublicKey,
  id: bigint,
  commit: Buffer,
  isAuto: boolean,
  samples: bigint,
  endAt: bigint
) {
  // Data format: discriminator (1) + id (8) + commit (32) + is_auto (8) + samples (8) + end_at (8) = 65 bytes
  const data = Buffer.alloc(65);
  data[0] = ENTROPY_OPEN;
  data.set(toLeBytes(id, 8), 1);
  commit.copy(data, 9);
  data.set(toLeBytes(isAuto ? 1n : 0n, 8), 41);
  data.set(toLeBytes(samples, 8), 49);
  data.set(toLeBytes(endAt, 8), 57);

  return {
    programId: ENTROPY_PROGRAM_ID,
    keys: [
      { pubkey: authority, isSigner: false, isWritable: false },
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: provider, isSigner: false, isWritable: false },
      { pubkey: varAddress, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  };
}

/**
 * Handler parameters passed to each action handler
 */
interface HandlerParams {
  connection: Connection;
  admin: Keypair;
  boardAddress: PublicKey;
  configAddress: PublicKey;
  varAddress: PublicKey;
  varId: bigint;
  varAccount: any;
  varData: any;
}

/**
 * Handle "open" action - Initialize Var account with commit
 */
async function handleOpen(params: HandlerParams): Promise<Response> {
  const { connection, admin, boardAddress, varAddress, varId, varAccount } = params;

  if (varAccount) {
    return NextResponse.json({
      success: false,
      error: "Var account already exists",
      varAddress: varAddress.toBase58(),
    });
  }

  // Generate seed and commit
  const seed = crypto.randomBytes(32);
  const commit = keccak256(seed);
  seedStorage.set(varAddress.toBase58(), seed);

  const currentSlot = await connection.getSlot();
  const endAt = BigInt(currentSlot + 5); // 5 slots from now

  debug(`Opening Var with commit: ${commit.toString("hex").slice(0, 16)}...`);
  debug(`End at slot: ${endAt}`);

  const tx = new Transaction().add({
    ...buildOpenInstruction(
      boardAddress,
      admin.publicKey,
      admin.publicKey,
      varAddress,
      varId,
      commit,
      true,
      1n,
      endAt
    ),
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: "confirmed",
  });

  return NextResponse.json({
    success: true,
    action: "open",
    signature: sig,
    varAddress: varAddress.toBase58(),
    endAt: Number(endAt),
    commit: commit.toString("hex"),
  });
}

/**
 * Handle "sample" action - Capture slot_hash
 */
async function handleSample(params: HandlerParams): Promise<Response> {
  const { connection, admin, varAddress, varAccount, varData } = params;

  if (!varAccount || !varData) {
    return NextResponse.json({
      success: false,
      error: "Var account not found. Call open first.",
    });
  }

  // Check if already sampled
  if (!varData.slotHash.every((b: number) => b === 0)) {
    return NextResponse.json({
      success: true,
      action: "sample",
      message: "Already sampled",
      slotHash: varData.slotHash.toString("hex"),
    });
  }

  const currentSlot = await connection.getSlot();
  if (currentSlot < varData.endAt) {
    return NextResponse.json({
      success: false,
      error: `Wait for slot ${varData.endAt} (current: ${currentSlot})`,
      currentSlot,
      endAt: Number(varData.endAt),
    });
  }

  debug(`Sampling at slot ${currentSlot}`);

  const tx = new Transaction().add({
    ...buildSampleInstruction(admin.publicKey, varAddress),
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: "confirmed",
  });

  // Re-fetch to get slot_hash
  const updatedVarAccount = await connection.getAccountInfo(varAddress);
  const updatedVarData = updatedVarAccount ? parseVarAccount(updatedVarAccount.data) : null;

  return NextResponse.json({
    success: true,
    action: "sample",
    signature: sig,
    slotHash: updatedVarData?.slotHash.toString("hex"),
  });
}

/**
 * Handle "reveal" action - Disclose seed and compute final value
 */
async function handleReveal(params: HandlerParams): Promise<Response> {
  const { connection, admin, varAddress, varAccount, varData } = params;

  if (!varAccount || !varData) {
    return NextResponse.json({
      success: false,
      error: "Var account not found",
    });
  }

  // Check if slot_hash is set
  if (varData.slotHash.every((b: number) => b === 0)) {
    return NextResponse.json({
      success: false,
      error: "Var not sampled yet. Call sample first.",
    });
  }

  // Check if already revealed
  if (!varData.value.every((b: number) => b === 0)) {
    const diceResult = calculateDiceFromValue(varData.value);
    return NextResponse.json({
      success: true,
      action: "reveal",
      message: "Already revealed",
      value: varData.value.toString("hex"),
      diceResult,
    });
  }

  // Get stored seed
  const seed = seedStorage.get(varAddress.toBase58());
  if (!seed) {
    return NextResponse.json({
      success: false,
      error: "Seed not found in storage. Re-run open first.",
    });
  }

  debug(`Revealing with seed: ${seed.toString("hex").slice(0, 16)}...`);

  const tx = new Transaction().add({
    ...buildRevealInstruction(admin.publicKey, varAddress, seed),
  });

  const sig = await sendAndConfirmTransaction(connection, tx, [admin], {
    commitment: "confirmed",
  });

  // Re-fetch to get value
  const updatedVarAccount = await connection.getAccountInfo(varAddress);
  const updatedVarData = updatedVarAccount ? parseVarAccount(updatedVarAccount.data) : null;

  const diceResult = updatedVarData ? calculateDiceFromValue(updatedVarData.value) : null;

  return NextResponse.json({
    success: true,
    action: "reveal",
    signature: sig,
    value: updatedVarData?.value.toString("hex"),
    diceResult,
  });
}

/**
 * Handle "full-cycle" action - Execute full open -> sample -> reveal cycle
 */
async function handleFullCycle(params: HandlerParams): Promise<Response> {
  const { connection, admin, boardAddress, configAddress } = params;

  // Execute full open -> sample -> reveal cycle using ore program's new_var
  // Always create a new Var account with fresh seed for true randomness
  const results: string[] = [];
  let diceResult = null;

  // Always increment counter to get a new unique varId for each roll
  varIdCounter++;
  const currentVarId = varIdCounter;
  const [currentVarAddress] = varPDA(boardAddress, currentVarId);
  debug(`[full-cycle] Creating new Var with id ${currentVarId}, address ${currentVarAddress.toBase58()}`);

  // Step 1: Open via ore's new_var - always create new
  const seed = crypto.randomBytes(32);
  const commit = keccak256(seed);
  seedStorage.set(currentVarAddress.toBase58(), seed);

  const openSlot = await connection.getSlot();

  debug(`[full-cycle] Opening Var via ore new_var at slot ${openSlot}`);
  debug(`[full-cycle] Admin: ${admin.publicKey.toBase58()}`);
  debug(`[full-cycle] Board: ${boardAddress.toBase58()}`);
  debug(`[full-cycle] Config: ${configAddress.toBase58()}`);
  debug(`[full-cycle] Seed: ${seed.toString("hex").slice(0, 16)}...`);
  debug(`[full-cycle] Commit: ${commit.toString("hex").slice(0, 16)}...`);

  const openTx = new Transaction().add({
    ...buildNewVarInstruction(
      admin.publicKey,
      boardAddress,
      configAddress,
      admin.publicKey, // provider = admin for localnet
      currentVarAddress,
      currentVarId,
      commit,
      1n // samples
    ),
  });

  const openSig = await sendAndConfirmTransaction(connection, openTx, [admin], {
    commitment: "confirmed",
  });

  // Verify transaction actually succeeded
  const openTxResult = await connection.getTransaction(openSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (openTxResult?.meta?.err) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    console.error('Open transaction failed:', openTxResult.meta.err); // Always log internally

    return NextResponse.json(
      {
        success: false,
        error: isDevelopment ? `Open transaction failed: ${JSON.stringify(openTxResult.meta.err)}` : 'Transaction failed',
      },
      { status: 500 }
    );
  }

  results.push(`open: ${openSig}`);

  let currentVarAccount = await connection.getAccountInfo(currentVarAddress);
  let currentVarData = currentVarAccount ? parseVarAccount(currentVarAccount.data) : null;

  if (!currentVarData) {
    return NextResponse.json({
      success: false,
      error: "Failed to create Var account",
      results,
    });
  }

  // Step 2: Sample - wait for end_at slot then sample
  let currentSlot = await connection.getSlot();
  while (currentSlot < currentVarData.endAt) {
    debug(`[full-cycle] Waiting for slot ${currentVarData.endAt} (current: ${currentSlot})`);
    await new Promise((r) => setTimeout(r, 400));
    currentSlot = await connection.getSlot();
  }

  debug(`[full-cycle] Sampling at slot ${currentSlot}`);

  const sampleTx = new Transaction().add({
    ...buildSampleInstruction(admin.publicKey, currentVarAddress),
  });

  const sampleSig = await sendAndConfirmTransaction(connection, sampleTx, [admin], {
    commitment: "confirmed",
  });

  // Verify transaction actually succeeded
  const sampleTxResult = await connection.getTransaction(sampleSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (sampleTxResult?.meta?.err) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    console.error('Sample transaction failed:', sampleTxResult.meta.err); // Always log internally

    return NextResponse.json(
      {
        success: false,
        error: isDevelopment ? `Sample transaction failed: ${JSON.stringify(sampleTxResult.meta.err)}` : 'Transaction failed',
        results
      },
      { status: 500 }
    );
  }

  results.push(`sample: ${sampleSig}`);

  currentVarAccount = await connection.getAccountInfo(currentVarAddress);
  currentVarData = currentVarAccount ? parseVarAccount(currentVarAccount.data) : null;

  if (!currentVarData || currentVarData.slotHash.every((b: number) => b === 0)) {
    return NextResponse.json({
      success: false,
      error: "Sample failed - no slot_hash",
      results,
    });
  }

  // Step 3: Reveal - disclose seed to compute final value
  debug(`[full-cycle] Revealing with seed`);

  const revealTx = new Transaction().add({
    ...buildRevealInstruction(admin.publicKey, currentVarAddress, seed),
  });

  const revealSig = await sendAndConfirmTransaction(connection, revealTx, [admin], {
    commitment: "confirmed",
  });

  // Verify transaction actually succeeded
  const revealTxResult = await connection.getTransaction(revealSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (revealTxResult?.meta?.err) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    console.error('Reveal transaction failed:', revealTxResult.meta.err); // Always log internally

    return NextResponse.json(
      {
        success: false,
        error: isDevelopment ? `Reveal transaction failed: ${JSON.stringify(revealTxResult.meta.err)}` : 'Transaction failed',
        results
      },
      { status: 500 }
    );
  }

  results.push(`reveal: ${revealSig}`);

  currentVarAccount = await connection.getAccountInfo(currentVarAddress);
  currentVarData = currentVarAccount ? parseVarAccount(currentVarAccount.data) : null;

  if (currentVarData && !currentVarData.value.every((b: number) => b === 0)) {
    diceResult = calculateDiceFromValue(currentVarData.value);
    debug(`[full-cycle] Dice result: ${diceResult.die1}-${diceResult.die2}=${diceResult.sum} (sq ${diceResult.winningSquare})`);
  }

  return NextResponse.json({
    success: true,
    action: "full-cycle",
    results,
    varId: Number(currentVarId),
    varAddress: currentVarAddress.toBase58(),
    diceResult,
  });
}

/**
 * Handle "status" action - Check current state of Var account
 */
async function handleStatus(params: HandlerParams): Promise<Response> {
  const { connection, varAddress, varAccount, varData } = params;

  if (!varAccount || !varData) {
    return NextResponse.json({
      success: true,
      action: "status",
      exists: false,
      varAddress: varAddress.toBase58(),
    });
  }

  const currentSlot = await connection.getSlot();
  const hasSeed = seedStorage.has(varAddress.toBase58());

  return NextResponse.json({
    success: true,
    action: "status",
    exists: true,
    varAddress: varAddress.toBase58(),
    currentSlot,
    endAt: Number(varData.endAt),
    readyForSample: currentSlot >= varData.endAt && varData.slotHash.every((b: number) => b === 0),
    sampled: !varData.slotHash.every((b: number) => b === 0),
    revealed: !varData.value.every((b: number) => b === 0),
    hasSeedStored: hasSeed,
    slotHash: varData.slotHash.toString("hex"),
    value: varData.value.toString("hex"),
    diceResult: !varData.value.every((b: number) => b === 0)
      ? calculateDiceFromValue(varData.value)
      : null,
  });
}

/**
 * Entropy action types
 */
type EntropyAction = 'open' | 'sample' | 'reveal' | 'full-cycle' | 'status';

/**
 * Handler map for each entropy action
 */
const handlers: Record<EntropyAction, (params: HandlerParams) => Promise<Response>> = {
  open: handleOpen,
  sample: handleSample,
  reveal: handleReveal,
  'full-cycle': handleFullCycle,
  status: handleStatus,
};

export async function POST(request: Request) {
  // Validate admin authentication
  const authResult = validateAdminToken(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    // Rate limiting check
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = apiLimiter.check(10, ip); // 10 requests per minute per IP

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { success: false, error: "Rate limit exceeded. Please try again later." },
        { status: 429 }
      );
    }

    const ALLOWED_NETWORK = process.env.SOLANA_NETWORK || 'localnet';
    const isLocalnet = ALLOWED_NETWORK === 'localnet';

    if (!isLocalnet) {
      return NextResponse.json(
        { error: "This endpoint is disabled in production" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || "full-cycle";

    const connection = new Connection(LOCALNET_RPC, "confirmed");
    const admin = loadAdminKeypair();

    // Get board and config addresses
    const [boardAddress] = boardPDA();
    const [configAddress] = configPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (!boardAccount) {
      return NextResponse.json(
        { success: false, error: "Board not initialized. Run ore-cli initialize first." },
        { status: 400 }
      );
    }

    // Var address for the board (id = 0)
    const varId = 0n;
    const [varAddress] = varPDA(boardAddress, varId);

    debug(`Board: ${boardAddress.toBase58()}`);
    debug(`Var: ${varAddress.toBase58()}`);
    debug(`Action: ${action}`);

    // Check if Var account exists
    const varAccount = await connection.getAccountInfo(varAddress);
    const varData = varAccount ? parseVarAccount(varAccount.data) : null;

    // Dispatch to the appropriate handler
    const handler = handlers[action as EntropyAction];

    if (!handler) {
      return NextResponse.json(
        { success: false, error: `Unknown action: ${action}` },
        { status: 400 }
      );
    }

    return handler({
      connection,
      admin,
      boardAddress,
      configAddress,
      varAddress,
      varId,
      varAccount,
      varData,
    });
  } catch (error) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    console.error('API Error:', error); // Always log internally

    debug("Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: isDevelopment ? String(error) : 'Internal server error',
        ...(isDevelopment && error instanceof Error && { stack: error.stack })
      },
      { status: 500 }
    );
  }
}
