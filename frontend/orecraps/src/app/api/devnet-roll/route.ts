import { NextResponse } from "next/server";
import crypto from "crypto";
import { squareToDice } from "@/lib/dice";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("DevnetRoll");

/**
 * Generate a random dice roll for devnet testing.
 *
 * On devnet, the entropy program isn't deployed, so we can't use on-chain RNG.
 * This endpoint generates a cryptographically random result for testing.
 *
 * The deployed devnet program has the `localnet` feature enabled,
 * which allows SettleCraps to accept any winning_square without RNG validation.
 */
export async function POST() {
  try {
    // Only allow on devnet/localnet
    const network = process.env.SOLANA_NETWORK || 'localnet';
    if (network === 'mainnet') {
      return NextResponse.json(
        { success: false, error: "Not available on mainnet" },
        { status: 400 }
      );
    }

    // Generate random winning square (0-35)
    const randomBytes = crypto.randomBytes(8);
    const sample = randomBytes.readBigUInt64LE(0);
    const winningSquare = Number(sample % 36n);

    // Convert to dice values
    const [die1, die2] = squareToDice(winningSquare);
    const diceSum = die1 + die2;

    debug(`Generated random roll: ${die1}+${die2}=${diceSum} (square ${winningSquare})`);

    return NextResponse.json({
      success: true,
      winningSquare,
      diceResults: {
        die1,
        die2,
        sum: diceSum,
      },
      message: `Random roll: ${die1}+${die2}=${diceSum}`,
    });
  } catch (error) {
    debug("Error generating roll:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
