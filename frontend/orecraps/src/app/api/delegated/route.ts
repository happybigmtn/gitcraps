import { NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { loadTestKeypair } from "@/lib/testKeypair";
import { LOCALNET_RPC } from "@/lib/cliConfig";
import { validateLocalnetOnly } from "@/lib/middleware";
import { CrapsGameService } from "@/services";
import {
  formatMessageForSigning,
  type SessionApprovalMessage,
} from "@/store/sessionStore";

const debug = createDebugger("Delegated");

/**
 * Session credentials passed from the client
 */
interface SessionCredentials {
  walletAddress: string;
  sessionPublicKey: string;
  approvalSignature: string;
  approvalMessage: string;
  expiresAt: number;
}

/**
 * Bet request structure
 */
interface BetRequest {
  betType: number;
  point?: number;
  amount: number;
}

/**
 * Request body structure
 */
interface DelegatedRequest {
  session: SessionCredentials;
  action: "place-bet" | "claim-winnings" | "settle-bets";
  bets?: BetRequest[];
  roundId?: bigint;
  winningSquare?: bigint;
}

/**
 * Verify the session approval signature
 * This confirms the wallet owner authorized this session key
 */
function verifySessionSignature(session: SessionCredentials): boolean {
  try {
    // Parse the original approval message
    const approvalMessage: SessionApprovalMessage = JSON.parse(session.approvalMessage);

    // Reconstruct the message that was signed
    const messageToVerify = formatMessageForSigning(approvalMessage);
    const messageBytes = new TextEncoder().encode(messageToVerify);

    // Decode the signature and wallet public key
    const signatureBytes = bs58.decode(session.approvalSignature);
    const walletPubkeyBytes = bs58.decode(session.walletAddress);

    // Verify the signature using nacl
    const isValid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      walletPubkeyBytes
    );

    if (!isValid) {
      debug("Session signature verification failed");
      return false;
    }

    // Also verify the session key in the message matches the provided session key
    if (approvalMessage.sessionKey !== session.sessionPublicKey) {
      debug("Session key mismatch in approval message");
      return false;
    }

    // Verify the wallet in the message matches the provided wallet
    if (approvalMessage.wallet !== session.walletAddress) {
      debug("Wallet address mismatch in approval message");
      return false;
    }

    return true;
  } catch (error) {
    debug("Error verifying session signature:", error);
    return false;
  }
}

/**
 * Validate session is still active
 */
function isSessionValid(session: SessionCredentials): boolean {
  return Date.now() < session.expiresAt;
}

/**
 * Delegated transaction endpoint
 *
 * This endpoint allows web wallet users to submit transactions without having SOL.
 * The server pays gas fees on behalf of users who have signed a session approval.
 *
 * Security:
 * - Session signature is verified to ensure wallet owner authorized this session
 * - Session expiry is checked
 * - Actions are restricted to game operations only
 * - Only available on localnet
 */
export async function POST(request: Request) {
  try {
    // Validate localnet only
    const localnetError = validateLocalnetOnly();
    if (localnetError) return localnetError;

    const body: DelegatedRequest = await request.json();
    const { session, action, bets, roundId, winningSquare } = body;

    // Validate session credentials are provided
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session credentials required" },
        { status: 400 }
      );
    }

    // Validate required session fields
    if (
      !session.walletAddress ||
      !session.sessionPublicKey ||
      !session.approvalSignature ||
      !session.approvalMessage ||
      !session.expiresAt
    ) {
      return NextResponse.json(
        { success: false, error: "Incomplete session credentials" },
        { status: 400 }
      );
    }

    // Check session expiry
    if (!isSessionValid(session)) {
      return NextResponse.json(
        { success: false, error: "Session expired" },
        { status: 401 }
      );
    }

    // Verify the session approval signature
    if (!verifySessionSignature(session)) {
      return NextResponse.json(
        { success: false, error: "Invalid session signature" },
        { status: 401 }
      );
    }

    debug(`Delegated request from ${session.walletAddress}: ${action}`);

    // Set up connection and services
    const connection = new Connection(LOCALNET_RPC, "confirmed");
    const gameService = new CrapsGameService(connection);

    // Use test keypair as fee payer (server pays gas)
    const feePayer = loadTestKeypair();

    // The user's wallet address (for account derivation)
    const userWallet = new PublicKey(session.walletAddress);

    debug(`Fee payer: ${feePayer.publicKey.toBase58()}`);
    debug(`User wallet: ${userWallet.toBase58()}`);

    // Handle different actions
    switch (action) {
      case "place-bet": {
        if (!bets || !Array.isArray(bets) || bets.length === 0) {
          return NextResponse.json(
            { success: false, error: "No bets provided" },
            { status: 400 }
          );
        }

        // Validate each bet
        for (const bet of bets) {
          if (typeof bet.amount !== "number" || bet.amount <= 0) {
            return NextResponse.json(
              { success: false, error: "Invalid bet amount: must be positive" },
              { status: 400 }
            );
          }

          if (bet.amount > 100) {
            return NextResponse.json(
              { success: false, error: "Bet amount exceeds maximum (100)" },
              { status: 400 }
            );
          }

          if (typeof bet.betType !== "number" || bet.betType < 0 || bet.betType > 25) {
            return NextResponse.json(
              { success: false, error: "Invalid bet type" },
              { status: 400 }
            );
          }

          if (bet.point !== undefined && bet.point !== null && bet.point !== 0) {
            const validPoints = [4, 5, 6, 8, 9, 10];
            if (!validPoints.includes(bet.point)) {
              return NextResponse.json(
                { success: false, error: "Invalid point value" },
                { status: 400 }
              );
            }
          }
        }

        // Calculate total required amount
        const totalAmount = bets.reduce((sum, bet) => sum + bet.amount, 0);

        // Validate user has enough balance (RNG tokens, not SOL)
        const balanceCheck = await gameService.validateBalance(userWallet, totalAmount + 0.1);
        if (!balanceCheck.valid) {
          return NextResponse.json(
            { success: false, error: balanceCheck.error },
            { status: 400 }
          );
        }

        debug(`Placing ${bets.length} bet(s) for user ${userWallet.toBase58()}`);

        // Place bets using service (with fee payer covering gas)
        // Note: We need to use a custom transaction that has the fee payer as signer
        const result = await gameService.placeBetsWithFeePayer(
          feePayer,
          userWallet,
          bets
        );

        if (!result.success) {
          debug("Transaction failed:", result.error);
          return NextResponse.json(
            { success: false, error: result.error || "Transaction failed" },
            { status: 500 }
          );
        }

        debug(`Transaction confirmed: ${result.signature}`);

        return NextResponse.json({
          success: true,
          signature: result.signature,
          walletAddress: userWallet.toBase58(),
          betsPlaced: result.betsPlaced,
          delegated: true,
        });
      }

      case "claim-winnings": {
        debug(`Claiming winnings for user ${userWallet.toBase58()}`);

        const result = await gameService.claimWinningsWithFeePayer(
          feePayer,
          userWallet
        );

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error || "Claim failed" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          signature: result.signature,
          walletAddress: userWallet.toBase58(),
          delegated: true,
        });
      }

      case "settle-bets": {
        if (roundId === undefined || winningSquare === undefined) {
          return NextResponse.json(
            { success: false, error: "Round ID and winning square required" },
            { status: 400 }
          );
        }

        debug(`Settling bets for round ${roundId}`);

        const result = await gameService.settleBetsWithFeePayer(
          feePayer,
          userWallet,
          BigInt(winningSquare),
          BigInt(roundId)
        );

        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error || "Settlement failed" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          signature: result.signature,
          walletAddress: userWallet.toBase58(),
          delegated: true,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
