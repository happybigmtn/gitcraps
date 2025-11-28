import { NextResponse } from "next/server";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { apiLimiter } from "@/lib/rateLimit";
import { CrapsGameService } from "@/services";
import { loadTestKeypair } from "@/lib/testKeypair";
import { LOCALNET_RPC } from "@/lib/cliConfig";

const debug = createDebugger("PlaceBet");

/**
 * Place a craps bet directly using server-side keypair (for localnet testing).
 * This bypasses wallet adapter issues with localhost.
 */
export async function POST(request: Request) {
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

    const body = await request.json();
    const { bets } = body;

    if (!bets || !Array.isArray(bets) || bets.length === 0) {
      return NextResponse.json(
        { success: false, error: "No bets provided" },
        { status: 400 }
      );
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
      const isDevelopment = process.env.NODE_ENV === 'development';
      console.error('Transaction failed:', result.error);

      return NextResponse.json(
        {
          success: false,
          error: isDevelopment ? `Transaction failed: ${result.error}` : 'Transaction failed',
        },
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
