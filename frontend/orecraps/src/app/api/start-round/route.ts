import { NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { getAdminKeypair } from "@/lib/adminKeypair";
import { getRpcEndpoint } from "@/lib/cliConfig";
import { ORE_PROGRAM_ID } from "@/lib/constants";
import { toLeBytes } from "@/lib/bufferUtils";

const debug = createDebugger("StartRound");

// Instruction discriminator
const START_ROUND_IX = 22;

// Default round duration in slots (~400ms per slot)
// 1000 slots = ~6.7 minutes
const DEFAULT_ROUND_DURATION = 1000n;

function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function configPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID);
}

function roundPDA(roundId: bigint): [PublicKey, number] {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), idBytes],
    ORE_PROGRAM_ID
  );
}

/**
 * Start a new mining round (admin only).
 *
 * This API should be called when:
 * 1. The current round has expired
 * 2. A new round needs to be started for mining/craps
 *
 * Only the admin keypair can start rounds.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const network = (body as { network?: string }).network || process.env.SOLANA_NETWORK || 'localnet';
    const duration = BigInt((body as { duration?: number }).duration || Number(DEFAULT_ROUND_DURATION));
    const rpcUrl = getRpcEndpoint(network);

    debug(`Starting new round on ${network} with duration ${duration} slots...`);

    const connection = new Connection(rpcUrl, "confirmed");
    const admin = getAdminKeypair();

    // Get board to check current state
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (!boardAccount) {
      return NextResponse.json(
        { success: false, error: "Board not initialized. Run ore-cli initialize first." },
        { status: 400 }
      );
    }

    const boardData = Buffer.from(boardAccount.data);
    const roundId = boardData.readBigUInt64LE(8);
    const startSlot = boardData.readBigUInt64LE(16);
    const endSlot = boardData.readBigUInt64LE(24);
    const currentSlot = await connection.getSlot();

    debug(`Current round ${roundId}: slots ${startSlot} to ${endSlot}, current: ${currentSlot}`);

    // Check if round is still active
    if (currentSlot >= Number(startSlot) && currentSlot < Number(endSlot)) {
      return NextResponse.json({
        success: true,
        message: "Round is still active",
        roundId: roundId.toString(),
        startSlot: startSlot.toString(),
        endSlot: endSlot.toString(),
        currentSlot,
        slotsRemaining: Number(endSlot) - currentSlot,
        alreadyActive: true,
      });
    }

    // Build StartRound instruction
    const [configAddress] = configPDA();
    const [roundAddress] = roundPDA(roundId);

    const data = Buffer.alloc(9);
    data[0] = START_ROUND_IX;
    const durationBytes = toLeBytes(duration, 8);
    durationBytes.forEach((b, i) => data[i + 1] = b);

    const instruction = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: boardAddress, isSigner: false, isWritable: true },
        { pubkey: configAddress, isSigner: false, isWritable: false },
        { pubkey: roundAddress, isSigner: false, isWritable: true },
      ],
      data,
    });

    const tx = new Transaction().add(instruction);

    debug("Sending StartRound transaction...");

    const signature = await sendAndConfirmTransaction(connection, tx, [admin], {
      commitment: "confirmed",
    });

    debug(`StartRound transaction confirmed: ${signature}`);

    // Re-fetch board to get new timing
    const newBoardAccount = await connection.getAccountInfo(boardAddress);
    const newBoardData = Buffer.from(newBoardAccount!.data);
    const newStartSlot = newBoardData.readBigUInt64LE(16);
    const newEndSlot = newBoardData.readBigUInt64LE(24);

    return NextResponse.json({
      success: true,
      signature,
      roundId: roundId.toString(),
      startSlot: newStartSlot.toString(),
      endSlot: newEndSlot.toString(),
      currentSlot: await connection.getSlot(),
      duration: duration.toString(),
      message: `Round ${roundId} started with duration ${duration} slots`,
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
