import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { ORE_PROGRAM_ID } from "@/lib/constants";
import { getRpcEndpoint } from "@/lib/cliConfig";
import { calculateRng, calculateWinningSquareFromHash, squareToDice } from "@/lib/dice";
import { readU64FromBuffer } from "@/lib/bufferUtils";

const debug = createDebugger("GetRoundResult");

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

// Round account layout offsets
const ROUND_ID_OFFSET = 8;
const ROUND_SLOT_HASH_OFFSET = 8 + 8 + 36 * 8; // After discriminator + id + deployed array = 304
const ROUND_DICE_RESULTS_OFFSET = 8 + 8 + 36 * 8 + 32 + 36 * 8 + 8 + 8 + 32 + 32 + 8 + 8 + 8 + 8; // Near end
const BOARD_ROUND_ID_OFFSET = 8;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const network = url.searchParams.get("network") || "localnet";
    const rpcEndpoint = getRpcEndpoint(network);

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
    const roundId = readU64FromBuffer(boardData, BOARD_ROUND_ID_OFFSET);

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
    const winningSquare = calculateWinningSquareFromHash(slotHash);

    // Calculate dice from winning square
    const [die1, die2] = squareToDice(winningSquare);
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
