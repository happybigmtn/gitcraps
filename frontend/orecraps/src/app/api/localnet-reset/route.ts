import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { ORE_PROGRAM_ID } from "@/lib/constants";
import { loadTestKeypair } from "@/lib/testKeypair";
import { LOCALNET_RPC } from "@/lib/cliConfig";
import { validateLocalnetOnly } from "@/lib/middleware";
import { readU64FromBuffer } from "@/lib/bufferUtils";
import { calculateWinningSquareFromHash, squareToDice } from "@/lib/dice";
import crypto from "crypto";

const debug = createDebugger("LocalnetReset");

// PDAs
function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function roundPDA(roundId: bigint): [PublicKey, number] {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), idBytes],
    ORE_PROGRAM_ID
  );
}

// Round account layout offsets
// 8 (discriminator) + 8 (id) + 36*8 (deployed[36]) = 8 + 8 + 288 = 304
const ROUND_SLOT_HASH_OFFSET = 304;
const BOARD_ROUND_ID_OFFSET = 8;

/**
 * Generate a slot hash that produces a specific winning square.
 * This allows testing specific dice outcomes.
 */
function generateSlotHashForWinningSquare(targetSquare?: number): { slotHash: Buffer; winningSquare: number } {
  if (targetSquare !== undefined && targetSquare >= 0 && targetSquare < 36) {
    // Generate random hashes until we get one that produces the target square
    for (let attempt = 0; attempt < 10000; attempt++) {
      const slotHash = crypto.randomBytes(32);
      const winningSquare = calculateWinningSquareFromHash(slotHash);
      if (winningSquare === targetSquare) {
        return { slotHash, winningSquare };
      }
    }
    // Fallback if we couldn't find one
    debug(`Could not find hash for target square ${targetSquare}, using random`);
  }

  // Generate random slot hash
  const slotHash = crypto.randomBytes(32);
  const winningSquare = calculateWinningSquareFromHash(slotHash);
  return { slotHash, winningSquare };
}

/**
 * Write slot_hash directly into the Round account using fetch to localnet RPC.
 * Uses Solana's setAccount RPC method which is only available on localnet/devnet.
 */
async function injectRngIntoRound(
  roundAddress: PublicKey,
  roundData: Buffer,
  slotHash: Buffer,
  owner: PublicKey,
  lamports: number
): Promise<boolean> {
  try {
    // Create a copy of the round data and inject the slot_hash
    const newData = Buffer.from(roundData);
    slotHash.copy(newData, ROUND_SLOT_HASH_OFFSET);

    debug(`Injecting RNG into Round account ${roundAddress.toBase58()}`);
    debug(`  slot_hash offset: ${ROUND_SLOT_HASH_OFFSET}`);
    debug(`  slot_hash: ${slotHash.toString("hex").slice(0, 32)}...`);

    // Use setAccount RPC method (localnet only)
    const response = await fetch(LOCALNET_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'setAccount',
        params: [
          roundAddress.toBase58(),
          {
            lamports,
            data: [newData.toString('base64'), 'base64'],
            owner: owner.toBase58(),
            executable: false,
            rentEpoch: 0,
          }
        ]
      })
    });

    const result = await response.json() as { result?: boolean; error?: { message: string } };

    if (result.error) {
      debug("RPC setAccount error:", result.error.message);
      return false;
    }

    debug("Successfully wrote Round account data with RNG via setAccount");
    return true;
  } catch (error) {
    debug("Error injecting RNG into Round:", error);
    return false;
  }
}

/**
 * Localnet-only API to inject RNG into the current Round account.
 * This enables testing on-chain settlement without running the full mining flow.
 *
 * Parameters:
 *   - winningSquare (optional): Target winning square (0-35). If provided,
 *     generates a slot_hash that produces this exact outcome.
 *
 * This writes directly to the Round account's slot_hash field using
 * `solana program write-account`, which is only possible on localnet.
 */
export async function POST(request: Request) {
  // Validate localnet only - no admin token needed for localnet testing
  const localnetError = validateLocalnetOnly();
  if (localnetError) return localnetError;

  try {
    const body = await request.json().catch(() => ({}));
    const targetSquare = typeof body.winningSquare === 'number' ? body.winningSquare : undefined;

    const connection = new Connection(LOCALNET_RPC, "confirmed");
    loadTestKeypair(); // Verify keypair exists

    debug("Injecting RNG into Round account...");
    if (targetSquare !== undefined) {
      debug(`Target winning square: ${targetSquare}`);
    }

    // Get board info to find current round ID
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (!boardAccount) {
      return NextResponse.json(
        { success: false, error: "Board not initialized. Run ore-cli initialize first." },
        { status: 400 }
      );
    }

    // Parse round_id from board
    const roundId = readU64FromBuffer(Buffer.from(boardAccount.data), BOARD_ROUND_ID_OFFSET);
    debug(`Current round ID: ${roundId}`);

    // Get round account
    const [roundAddress] = roundPDA(roundId);
    const roundAccount = await connection.getAccountInfo(roundAddress);

    if (!roundAccount) {
      return NextResponse.json(
        { success: false, error: `Round ${roundId} not found` },
        { status: 404 }
      );
    }

    const roundData = Buffer.from(roundAccount.data);
    debug(`Round account size: ${roundData.length} bytes`);

    // Check current slot_hash
    const currentSlotHash = roundData.subarray(ROUND_SLOT_HASH_OFFSET, ROUND_SLOT_HASH_OFFSET + 32);
    const isZero = currentSlotHash.every(b => b === 0);
    debug(`Current slot_hash is ${isZero ? "zero (no RNG)" : "non-zero"}`);

    // Generate a slot_hash that produces the target winning square (or random)
    const { slotHash, winningSquare } = generateSlotHashForWinningSquare(targetSquare);
    const [die1, die2] = squareToDice(winningSquare);
    const diceSum = die1 + die2;

    debug(`Generated winning square: ${winningSquare} (dice: ${die1}+${die2}=${diceSum})`);

    // Inject the RNG into the Round account
    const success = await injectRngIntoRound(
      roundAddress,
      roundData,
      slotHash,
      new PublicKey(roundAccount.owner),
      roundAccount.lamports
    );

    if (!success) {
      return NextResponse.json({
        success: false,
        error: "Failed to inject RNG into Round account. Make sure localnet is running with setAccount RPC enabled.",
        roundId: roundId.toString(),
        roundAddress: roundAddress.toBase58(),
      }, { status: 500 });
    }

    // Verify the write was successful
    const updatedRound = await connection.getAccountInfo(roundAddress);
    if (updatedRound) {
      const newSlotHash = Buffer.from(updatedRound.data).subarray(ROUND_SLOT_HASH_OFFSET, ROUND_SLOT_HASH_OFFSET + 32);
      const verified = newSlotHash.equals(slotHash);
      debug(`RNG injection verified: ${verified}`);

      if (!verified) {
        return NextResponse.json({
          success: false,
          error: "RNG injection did not persist - slot_hash mismatch",
          roundId: roundId.toString(),
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      message: "RNG injected into Round account successfully",
      roundId: roundId.toString(),
      roundAddress: roundAddress.toBase58(),
      winningSquare,
      diceResults: { die1, die2, sum: diceSum },
      slotHash: slotHash.toString("hex"),
      note: "Round is now ready for settlement. Call /api/settle-craps with the same winningSquare.",
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
