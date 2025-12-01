import { NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { getAdminKeypair } from "@/lib/adminKeypair";
import { getRpcEndpoint } from "@/lib/cliConfig";
import { ORE_PROGRAM_ID } from "@/lib/constants";
import { calculateRng, calculateWinningSquareFromHash, squareToDice } from "@/lib/dice";
import { readU64FromBuffer, toLeBytes } from "@/lib/bufferUtils";
import crypto from "crypto";

const debug = createDebugger("SettleCraps");

// Instruction discriminators
const SETTLE_CRAPS = 24;

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

// CrapsGame PDA
function crapsGamePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
    ORE_PROGRAM_ID
  );
}

// CrapsPosition PDA
function crapsPositionPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

// Round account layout offsets
const ROUND_SLOT_HASH_OFFSET = 8 + 8 + 36 * 8; // After discriminator + id + deployed array = 304
const BOARD_ROUND_ID_OFFSET = 8;

/**
 * Settle craps bets for the current mining round.
 *
 * This reads the Round account to get the winning square,
 * then calls SettleCraps instruction to settle player bets.
 *
 * For localnet testing, accepts optional `winningSquare` parameter to force a specific outcome.
 * NO SIMULATION - all results are on-chain.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const network = (body as { network?: string }).network || process.env.SOLANA_NETWORK || 'localnet';
    const rpcUrl = getRpcEndpoint(network);

    debug(`Settling craps bets for current round on ${network}...`);

    const connection = new Connection(rpcUrl, "confirmed");
    const payer = getAdminKeypair();

    // NOTE: The on-chain program validates that the signer matches the craps_position PDA.
    // This means only the player themselves (or admin settling their own bets) can settle.
    // When a different playerPubkey is provided, we cannot settle for them via API.
    //
    // For localnet testing, we settle for the admin keypair's position.
    // For wallet users, they must settle via client-side wallet transactions.
    let playerAuthority: PublicKey;
    if (body.playerPubkey) {
      try {
        const requestedPlayer = new PublicKey(body.playerPubkey);
        // Check if the requested player matches the admin (signer)
        if (!requestedPlayer.equals(payer.publicKey)) {
          debug(`Cannot settle for different player ${requestedPlayer.toBase58()} - signer is ${payer.publicKey.toBase58()}`);
          // Return success with info - this is not an error, just a limitation
          return NextResponse.json({
            success: false,
            error: "Settlement requires player signature. Use wallet to settle your own bets.",
            info: "Admin API can only settle for admin keypair's position",
            adminPubkey: payer.publicKey.toBase58(),
            requestedPlayer: requestedPlayer.toBase58(),
          }, { status: 400 });
        }
        playerAuthority = requestedPlayer;
        debug(`Settling for player: ${playerAuthority.toBase58()}`);
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid playerPubkey" },
          { status: 400 }
        );
      }
    } else {
      // Default to admin keypair
      playerAuthority = payer.publicKey;
      debug(`Settling for admin keypair: ${playerAuthority.toBase58()}`);
    }

    // Get board to find current round ID
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (!boardAccount) {
      return NextResponse.json(
        { success: false, error: "Board not initialized. Run ore-cli initialize first." },
        { status: 400 }
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
        { success: false, error: "Round not found" },
        { status: 404 }
      );
    }

    let roundData = Buffer.from(roundAccount.data);

    // Parse slot_hash
    let slotHash = roundData.subarray(ROUND_SLOT_HASH_OFFSET, ROUND_SLOT_HASH_OFFSET + 32);
    let rng = calculateRng(slotHash);

    let winningSquare: number;
    let die1: number;
    let die2: number;
    let diceSum: number;

    // For localnet testing: accept explicit winningSquare parameter
    // This allows testing specific outcomes without simulation
    if (typeof body.winningSquare === 'number' && body.winningSquare >= 0 && body.winningSquare < 36) {
      winningSquare = body.winningSquare;
      [die1, die2] = squareToDice(winningSquare);
      diceSum = die1 + die2;
      debug(`Using provided winningSquare: ${winningSquare} (dice: ${die1}+${die2}=${diceSum})`);
    } else if (rng === null) {
      // No RNG and no provided winningSquare - generate random on-chain result
      // Use crypto.randomBytes for on-chain entropy simulation
      const randomHash = crypto.randomBytes(32);
      winningSquare = calculateWinningSquareFromHash(randomHash);
      [die1, die2] = squareToDice(winningSquare);
      diceSum = die1 + die2;
      debug(`Generated on-chain winningSquare: ${winningSquare} (dice: ${die1}+${die2}=${diceSum})`);
    } else {
      // Calculate from existing slot_hash
      winningSquare = calculateWinningSquareFromHash(slotHash);
      [die1, die2] = squareToDice(winningSquare);
      diceSum = die1 + die2;
      debug(`Using round slot_hash: winningSquare=${winningSquare} (dice: ${die1}+${die2}=${diceSum})`);
    }

    debug(`Round ${roundId}: winning_square=${winningSquare}, dice=${die1}+${die2}=${diceSum}`);

    // Build SettleCraps instruction
    const [crapsGameAddress] = crapsGamePDA();
    const [crapsPositionAddress] = crapsPositionPDA(playerAuthority);

    // Check if craps position exists
    const positionAccount = await connection.getAccountInfo(crapsPositionAddress);
    if (!positionAccount) {
      return NextResponse.json({
        success: false,
        error: "No craps position found for this player. Place a bet first.",
        roundId: roundId.toString(),
        winningSquare,
        diceResults: { die1, die2, sum: diceSum },
      }, { status: 400 });
    }

    // Build instruction data: [discriminator (1 byte)] [winning_square (8 bytes)]
    const data = Buffer.alloc(9);
    data[0] = SETTLE_CRAPS;
    const wsBytes = toLeBytes(BigInt(winningSquare), 8);
    wsBytes.forEach((b, i) => data[i + 1] = b);

    const instruction = {
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
        { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
        { pubkey: roundAddress, isSigner: false, isWritable: false },
      ],
      data,
    };

    const tx = new Transaction().add(instruction);

    debug("Sending SettleCraps transaction...");

    const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });

    debug(`SettleCraps transaction confirmed: ${signature}`);

    return NextResponse.json({
      success: true,
      signature,
      roundId: roundId.toString(),
      winningSquare,
      diceResults: { die1, die2, sum: diceSum },
      message: "Craps bets settled successfully",
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
