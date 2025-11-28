import { NextResponse } from "next/server";
import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { apiLimiter } from "@/lib/rateLimit";
import { ORE_PROGRAM_ID } from "@/lib/constants";
import fs from "fs";

const debug = createDebugger("PlaceBet");

const LOCALNET_RPC = "http://127.0.0.1:8899";
const DEVNET_RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

function loadTestKeypair(): Keypair {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Test keypairs not allowed in production');
  }
  const seedString = process.env.TEST_KEYPAIR_SEED;
  if (!seedString) {
    throw new Error('TEST_KEYPAIR_SEED environment variable not set');
  }
  const seed = Buffer.from(seedString, 'base64');
  return Keypair.fromSeed(seed);
}

// Helper to convert bigint to little-endian bytes
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

// PDAs
function crapsGamePDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
    ORE_PROGRAM_ID
  );
}

function crapsPositionPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

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

    const rpcEndpoint = LOCALNET_RPC;
    const connection = new Connection(rpcEndpoint, "confirmed");

    // Use test keypair for localnet
    const payer = loadTestKeypair();

    debug(`Placing ${bets.length} bet(s) on ${network}`);
    debug(`Payer: ${payer.publicKey.toBase58()}`);

    // Check balance
    const balance = await connection.getBalance(payer.publicKey);
    debug(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    if (balance < LAMPORTS_PER_SOL * 0.1) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient balance. Test wallet has ${balance / LAMPORTS_PER_SOL} SOL. Run: solana airdrop 5 ${payer.publicKey.toBase58()} --url localhost`,
        },
        { status: 400 }
      );
    }

    // Build transaction
    const transaction = new Transaction();
    const [crapsGameAddress] = crapsGamePDA();
    const [crapsPositionAddress] = crapsPositionPDA(payer.publicKey);

    for (const bet of bets) {
      const { betType, point, amount } = bet;
      const amountLamports = BigInt(Math.floor(amount * LAMPORTS_PER_SOL));

      // Build instruction data: [discriminator(1), betType(1), point(1), padding(6), amount(8)]
      const data = new Uint8Array(17);
      data[0] = 23; // PlaceCrapsBet discriminator
      data[1] = betType;
      data[2] = point || 0;
      data.set(toLeBytes(amountLamports, 8), 9);

      const ix = new TransactionInstruction({
        programId: ORE_PROGRAM_ID,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: true },
          { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
          { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data: Buffer.from(data),
      });

      transaction.add(ix);
      debug(`Added bet: type=${betType}, point=${point}, amount=${amount} SOL`);
    }

    // Send and confirm transaction
    debug("Sending transaction...");
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [payer],
      { commitment: "confirmed" }
    );

    // Verify transaction actually succeeded
    const txResult = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (txResult?.meta?.err) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      console.error('Transaction failed:', txResult.meta.err); // Always log internally

      return NextResponse.json(
        {
          success: false,
          error: isDevelopment ? `Transaction failed: ${JSON.stringify(txResult.meta.err)}` : 'Transaction failed',
        },
        { status: 500 }
      );
    }

    debug(`Transaction confirmed: ${signature}`);

    return NextResponse.json({
      success: true,
      signature,
      payer: payer.publicKey.toBase58(),
      betsPlaced: bets.length,
    });
  } catch (error) {
    debug("Error:", error);
    return handleApiError(error);
  }
}
