import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { ORE_PROGRAM_ID } from "@/lib/constants";

const debug = createDebugger("GetRoundResult");

const LOCALNET_RPC = "http://127.0.0.1:8899";
const DEVNET_RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

// Board PDA
function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("board")],
    ORE_PROGRAM_ID
  );
}

// Round PDA
function roundPDA(roundId: bigint): [PublicKey, number] {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), idBytes],
    ORE_PROGRAM_ID
  );
}

// Read u64 from buffer
function readU64(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}

// Calculate RNG from slot_hash (XOR 4 u64 segments)
function calculateRng(slotHash: Buffer): bigint | null {
  if (slotHash.every((b) => b === 0) || slotHash.every((b) => b === 255)) {
    return null;
  }
  const r1 = slotHash.readBigUInt64LE(0);
  const r2 = slotHash.readBigUInt64LE(8);
  const r3 = slotHash.readBigUInt64LE(16);
  const r4 = slotHash.readBigUInt64LE(24);
  return r1 ^ r2 ^ r3 ^ r4;
}

// Calculate winning square using keccak hash (matches on-chain)
function calculateWinningSquare(slotHash: Buffer): number {
  // Use crypto for keccak256 - same as on-chain
  const crypto = require("crypto");
  const hash = crypto.createHash("sha3-256").update(slotHash).digest();
  const sample = hash.readBigUInt64LE(0);

  const boardSize = 36n;
  const maxValid = (BigInt("0xFFFFFFFFFFFFFFFF") / boardSize) * boardSize;

  if (sample < maxValid) {
    return Number(sample % boardSize);
  } else {
    // Retry with hash of hash
    const hash2 = crypto.createHash("sha3-256").update(hash).digest();
    const sample2 = hash2.readBigUInt64LE(0);
    return Number(sample2 % boardSize);
  }
}

// Round account layout offsets
const ROUND_ID_OFFSET = 8;
const ROUND_SLOT_HASH_OFFSET = 8 + 8 + 36 * 8; // After discriminator + id + deployed array = 304
const ROUND_DICE_RESULTS_OFFSET = 8 + 8 + 36 * 8 + 32 + 36 * 8 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 8; // Near end
const BOARD_ROUND_ID_OFFSET = 8;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const network = url.searchParams.get("network") || "localnet";
    const rpcEndpoint = network === "localnet" ? LOCALNET_RPC : DEVNET_RPC;

    debug(`Fetching round result from ${network}`);

    const connection = new Connection(rpcEndpoint, "confirmed");

    // Get board to find current round ID
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (!boardAccount) {
      return NextResponse.json(
        { success: false, error: "Board not found" },
        { status: 404 }
      );
    }

    const boardData = Buffer.from(boardAccount.data);
    const roundId = readU64(boardData, BOARD_ROUND_ID_OFFSET);

    debug(`Current round ID: ${roundId}`);

    // Get round account
    const [roundAddress] = roundPDA(roundId);
    const roundAccount = await connection.getAccountInfo(roundAddress);

    if (!roundAccount) {
      return NextResponse.json(
        { success: false, error: "Round not found", hasResult: false },
        { status: 404 }
      );
    }

    const roundData = Buffer.from(roundAccount.data);

    // Parse slot_hash
    const slotHash = roundData.subarray(ROUND_SLOT_HASH_OFFSET, ROUND_SLOT_HASH_OFFSET + 32);
    const rng = calculateRng(slotHash);

    if (rng === null) {
      debug("Round has no valid RNG yet");
      return NextResponse.json({
        success: true,
        hasResult: false,
        roundId: roundId.toString(),
        message: "Round not yet settled - waiting for slot hash",
      });
    }

    // Calculate winning square
    const winningSquare = calculateWinningSquare(slotHash);

    // Calculate dice from winning square
    const die1 = Math.floor(winningSquare / 6) + 1;
    const die2 = (winningSquare % 6) + 1;
    const diceSum = die1 + die2;

    debug(`Round ${roundId}: winning_square=${winningSquare}, dice=${die1}+${die2}=${diceSum}`);

    return NextResponse.json({
      success: true,
      hasResult: true,
      roundId: roundId.toString(),
      winningSquare,
      diceResults: [die1, die2],
      diceSum,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
