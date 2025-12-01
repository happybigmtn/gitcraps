import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { apiLimiter } from "@/lib/rateLimit";
import { CrapsGameService } from "@/services";
import { loadTestKeypair } from "@/lib/testKeypair";
import { LOCALNET_RPC } from "@/lib/cliConfig";
import { validateLocalnetOnly } from "@/lib/middleware";

const debug = createDebugger("PlaceBet");

/**
 * Place a craps bet directly using server-side keypair (for localnet testing).
 * This bypasses wallet adapter issues with localhost.
 */
export async function POST(request: Request) {
  try {
    const localnetError = validateLocalnetOnly();
    if (localnetError) return localnetError;

    // Rate limiting is skipped for localnet (testing environment)
    // The API only works on localnet anyway, so no rate limiting needed

    const body = await request.json();
    const { bets } = body;

    if (!bets || !Array.isArray(bets) || bets.length === 0) {
      return NextResponse.json(
        { success: false, error: "No bets provided" },
        { status: 400 }
      );
    }

    // Validate each bet in the array
    for (const bet of bets) {
      // Validate amount is a positive number
      if (typeof bet.amount !== 'number' || bet.amount <= 0) {
        return NextResponse.json(
          { success: false, error: 'Invalid bet amount: must be positive' },
          { status: 400 }
        );
      }

      // Validate amount doesn't exceed maximum
      if (bet.amount > 100) {
        return NextResponse.json(
          { success: false, error: 'Bet amount exceeds maximum (100 SOL)' },
          { status: 400 }
        );
      }

      // Validate betType is a valid number in range (0-25 for all bet types including side bets)
      if (typeof bet.betType !== 'number' || bet.betType < 0 || bet.betType > 25) {
        return NextResponse.json(
          { success: false, error: 'Invalid bet type' },
          { status: 400 }
        );
      }

      // Validate point if provided and non-zero
      // point=0 is valid for non-point bets (PassLine, Field, etc.)
      if (bet.point !== undefined && bet.point !== null && bet.point !== 0) {
        const validPoints = [4, 5, 6, 8, 9, 10];
        if (!validPoints.includes(bet.point)) {
          return NextResponse.json(
            { success: false, error: 'Invalid point value: must be 4, 5, 6, 8, 9, or 10' },
            { status: 400 }
          );
        }
      }
    }

    const connection = new Connection(LOCALNET_RPC, "confirmed");
    const gameService = new CrapsGameService(connection);

    // Use test keypair for localnet
    const payer = loadTestKeypair();

    debug(`Placing ${bets.length} bet(s)`);
    debug(`Payer: ${payer.publicKey.toBase58()}`);

    // Calculate total required amount
    const totalAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);

    // Validate balance using service
    const balanceCheck = await gameService.validateBalance(payer.publicKey, totalAmount + 0.1);
    if (!balanceCheck.valid) {
      return NextResponse.json(
        {
          success: false,
          error: `${balanceCheck.error} Run: solana airdrop 5 ${payer.publicKey.toBase58()} --url localhost`,
        },
        { status: 400 }
      );
    }

    debug(`Balance: ${balanceCheck.balance} SOL`);

    // Log bets being placed
    bets.forEach(bet => {
      debug(`Bet: type=${bet.betType}, point=${bet.point || 0}, amount=${bet.amount} SOL`);
    });

    // Place bets using service
    const result = await gameService.placeBets(payer, bets);

    if (!result.success) {
      debug('Transaction failed:', result.error);
      return NextResponse.json(
        { success: false, error: result.error || 'Transaction failed' },
        { status: 500 }
      );
    }

    debug(`Transaction confirmed: ${result.signature}`);

    return NextResponse.json({
      success: true,
      signature: result.signature,
      payer: payer.publicKey.toBase58(),
      betsPlaced: result.betsPlaced,
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
