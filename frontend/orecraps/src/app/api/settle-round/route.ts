import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { validateAdminToken } from "@/lib/adminAuth";
import { diceToSquare } from "@/lib/dice";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_SLOT_HASHES_PUBKEY,
} from "@solana/web3.js";
import { getAdminKeypair } from "@/lib/adminKeypair";
import crypto from "crypto";
import { keccak256 as keccak256Hash } from "js-sha3";
import { ENTROPY_PROGRAM_ID, SYSTEM_PROGRAM_ID, ORE_PROGRAM_ID } from "@/lib/constants";
import { storeSeed, retrieveSeed } from "@/lib/seedStorage";
import { LOCALNET_RPC, DEVNET_RPC, getRpcEndpoint } from "@/lib/cliConfig";
import { toLeBytes, readU64 } from "@/lib/bufferUtils";

const debug = createDebugger("SettleRound");

// Instruction discriminators
const ENTROPY_OPEN = 0;
const ENTROPY_SAMPLE = 5;
const ENTROPY_REVEAL = 4;

// Counter for unique var IDs (persisted in memory for localnet testing)
let varIdCounter = 0n;

function keccak256(data: Buffer): Buffer {
  const hashHex = keccak256Hash(data);
  return Buffer.from(hashHex, "hex");
}

function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function varPDA(authority: PublicKey, id: bigint): [PublicKey, number] {
  const idBytes = toLeBytes(id, 8);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("var"), authority.toBuffer(), idBytes],
    ENTROPY_PROGRAM_ID
  );
}

/**
 * Build Open instruction - direct entropy program call with calculated end_at
 * This bypasses the ore program's new_var which uses board.end_slot (which may be stale)
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
      { pubkey: authority, isSigner: true, isWritable: false }, // authority must be signer
      { pubkey: signer, isSigner: true, isWritable: true },     // payer must be signer
      { pubkey: provider, isSigner: false, isWritable: false },
      { pubkey: varAddress, isSigner: false, isWritable: true },
      { pubkey: SYSTEM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  };
}

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

// Var account offsets (8-byte discriminator prefix)
const VAR_OFFSETS = {
  discriminator: 0,
  authority: 8,
  id: 40,
  provider: 48,
  commit: 80,
  seed: 112,
  slot_hash: 144,
  value: 176,
  samples: 208,
  is_auto: 216,
  start_at: 224,
  end_at: 232,
};

function parseVarAccount(data: Uint8Array) {
  return {
    endAt: readU64(data, VAR_OFFSETS.end_at),
    value: Buffer.from(data.slice(VAR_OFFSETS.value, VAR_OFFSETS.value + 32)),
  };
}

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

  // Convert square to dice (square = (die1-1)*6 + (die2-1))
  const die1 = Math.floor(winningSquare / 6) + 1;
  const die2 = (winningSquare % 6) + 1;
  const sum = die1 + die2;

  return { die1, die2, sum, winningSquare };
}

/**
 * Settle the current mining round on-chain.
 *
 * This performs a full on-chain entropy cycle:
 * 1. Creates a new Var account with commit (new_var instruction)
 * 2. Waits for end_at slot and samples slot_hash
 * 3. Reveals seed to compute final value
 * 4. Returns dice result from on-chain entropy
 *
 * ALL TRANSACTIONS ARE ON-CHAIN. No simulated results.
 */
export async function POST(request: Request) {
  const ALLOWED_NETWORK = process.env.SOLANA_NETWORK || 'localnet';

  // Skip admin auth on localnet for testing convenience
  if (ALLOWED_NETWORK !== 'localnet') {
    const authResult = validateAdminToken(request);
    if (!authResult.authorized) {
      return authResult.response;
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const network = (body as { network?: string }).network || ALLOWED_NETWORK;
    const rpcUrl = getRpcEndpoint(network);

    debug(`Settling round on ${network} with on-chain entropy (RPC: ${rpcUrl})...`);

    const connection = new Connection(rpcUrl, "confirmed");
    const admin = getAdminKeypair();

    const [boardAddress] = boardPDA();

    // Verify board is initialized
    const boardAccount = await connection.getAccountInfo(boardAddress);
    if (!boardAccount) {
      return NextResponse.json(
        { success: false, error: "Board not initialized. Run ore-cli initialize first." },
        { status: 400 }
      );
    }

    // Always create a new Var account for true randomness
    // Use admin as authority (not board PDA) since we're calling entropy directly
    // and can't sign for the board PDA
    varIdCounter++;
    const currentVarId = varIdCounter;
    const [varAddress] = varPDA(admin.publicKey, currentVarId);

    debug(`Creating new Var with id ${currentVarId}, address ${varAddress.toBase58()}`);

    // Step 1: Open directly via entropy program with calculated end_at
    // This bypasses the ore program's new_var which uses board.end_slot (which may be stale)
    const seed = crypto.randomBytes(32);
    const commit = keccak256(seed);
    storeSeed(varAddress.toBase58(), seed);

    const currentSlotForOpen = await connection.getSlot();
    const endAt = BigInt(currentSlotForOpen + 5); // 5 slots from now

    debug(`Opening Var via direct entropy open instruction (endAt: ${endAt})...`);

    const openTx = new Transaction().add({
      ...buildOpenInstruction(
        admin.publicKey,   // authority = admin (can sign)
        admin.publicKey,   // signer/payer = admin
        admin.publicKey,   // provider = admin for localnet
        varAddress,
        currentVarId,
        commit,
        true,              // isAuto
        1n,                // samples
        endAt
      ),
    });

    const openSig = await sendAndConfirmTransaction(connection, openTx, [admin], {
      commitment: "confirmed",
    });

    debug(`Open tx: ${openSig}`);

    // Use the calculated endAt value directly
    const varData = { endAt };

    // Step 2: Wait for end_at slot then sample
    let currentSlot = await connection.getSlot();
    while (currentSlot < varData.endAt) {
      debug(`Waiting for slot ${varData.endAt} (current: ${currentSlot})`);
      await new Promise((r) => setTimeout(r, 400));
      currentSlot = await connection.getSlot();
    }

    debug(`Sampling at slot ${currentSlot}...`);

    const sampleTx = new Transaction().add({
      ...buildSampleInstruction(admin.publicKey, varAddress),
    });

    const sampleSig = await sendAndConfirmTransaction(connection, sampleTx, [admin], {
      commitment: "confirmed",
    });

    debug(`Sample tx: ${sampleSig}`);

    // Step 3: Reveal seed
    debug(`Revealing seed...`);

    const revealTx = new Transaction().add({
      ...buildRevealInstruction(admin.publicKey, varAddress, seed),
    });

    const revealSig = await sendAndConfirmTransaction(connection, revealTx, [admin], {
      commitment: "confirmed",
    });

    debug(`Reveal tx: ${revealSig}`);

    // Fetch final value
    const finalVarAccount = await connection.getAccountInfo(varAddress);
    if (!finalVarAccount) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch final Var account" },
        { status: 500 }
      );
    }

    const finalVarData = parseVarAccount(finalVarAccount.data);
    const diceResult = calculateDiceFromValue(finalVarData.value);

    debug(`On-chain dice result: ${diceResult.die1} + ${diceResult.die2} = ${diceResult.sum} (square ${diceResult.winningSquare})`);

    return NextResponse.json({
      success: true,
      message: "Round settled on-chain",
      signatures: {
        open: openSig,
        sample: sampleSig,
        reveal: revealSig,
      },
      varAddress: varAddress.toBase58(),
      diceResults: diceResult,
      winningSquare: diceResult.winningSquare,
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
