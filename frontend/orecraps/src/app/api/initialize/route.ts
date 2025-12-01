import { NextResponse } from "next/server";
import { Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { loadTestKeypair } from "@/lib/testKeypair";
import { LOCALNET_RPC } from "@/lib/cliConfig";
import { validateLocalnetOnly } from "@/lib/middleware";
import { createInitializeInstruction } from "@/lib/program";
import { boardPDA, configPDA, treasuryPDA, roundPDA } from "@/lib/solana";

const debug = createDebugger("Initialize");

/**
 * Initialize the ORE program on localnet.
 * Creates Board, Config, Treasury, and Round 0 accounts.
 * This must be called once after starting the localnet validator.
 */
export async function POST() {
  // Validate localnet only
  const localnetError = validateLocalnetOnly();
  if (localnetError) return localnetError;

  try {
    const connection = new Connection(LOCALNET_RPC, "confirmed");
    const payer = loadTestKeypair();

    debug(`Initializing ORE program with payer: ${payer.publicKey.toBase58()}`);

    // Check if already initialized by looking for the Board account
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    if (boardAccount) {
      debug("Program already initialized - Board account exists");
      return NextResponse.json({
        success: true,
        message: "Program already initialized",
        alreadyInitialized: true,
        boardAddress: boardAddress.toBase58(),
      });
    }

    // Airdrop SOL to payer if needed
    const balance = await connection.getBalance(payer.publicKey);
    if (balance < 1e9) {
      debug("Airdropping SOL to payer...");
      const sig = await connection.requestAirdrop(payer.publicKey, 5e9);
      await connection.confirmTransaction(sig, "confirmed");
      debug("Airdrop confirmed");
    }

    // Build Initialize instruction
    const initInstruction = createInitializeInstruction(payer.publicKey);

    // Create and sign transaction
    const tx = new Transaction().add(initInstruction);
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.feePayer = payer.publicKey;

    debug("Sending Initialize transaction...");

    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });

    debug(`Initialize transaction confirmed: ${signature}`);

    // NOTE: CrapsGame account is auto-created on first PlaceCrapsBet - no separate init needed

    // Get PDA addresses for response
    const [configAddress] = configPDA();
    const [treasuryAddress] = treasuryPDA();
    const [round0Address] = roundPDA(0n);

    return NextResponse.json({
      success: true,
      message: "Program initialized successfully",
      signature,
      accounts: {
        board: boardAddress.toBase58(),
        config: configAddress.toBase58(),
        treasury: treasuryAddress.toBase58(),
        round0: round0Address.toBase58(),
      },
    });
  } catch (error) {
    debug("Initialize error:", error);
    return handleApiError(error);
  }
}

/**
 * Check if program is initialized
 */
export async function GET() {
  // Validate localnet only
  const localnetError = validateLocalnetOnly();
  if (localnetError) return localnetError;

  try {
    const connection = new Connection(LOCALNET_RPC, "confirmed");

    // Check Board account
    const [boardAddress] = boardPDA();
    const boardAccount = await connection.getAccountInfo(boardAddress);

    // Check Config account
    const [configAddress] = configPDA();
    const configAccount = await connection.getAccountInfo(configAddress);

    // Check Treasury account
    const [treasuryAddress] = treasuryPDA();
    const treasuryAccount = await connection.getAccountInfo(treasuryAddress);

    // Check Round 0 account
    const [round0Address] = roundPDA(0n);
    const round0Account = await connection.getAccountInfo(round0Address);

    const initialized = !!(boardAccount && configAccount && treasuryAccount && round0Account);

    return NextResponse.json({
      success: true,
      initialized,
      accounts: {
        board: {
          address: boardAddress.toBase58(),
          exists: !!boardAccount,
          size: boardAccount?.data?.length ?? 0,
        },
        config: {
          address: configAddress.toBase58(),
          exists: !!configAccount,
          size: configAccount?.data?.length ?? 0,
        },
        treasury: {
          address: treasuryAddress.toBase58(),
          exists: !!treasuryAccount,
          size: treasuryAccount?.data?.length ?? 0,
        },
        round0: {
          address: round0Address.toBase58(),
          exists: !!round0Account,
          size: round0Account?.data?.length ?? 0,
        },
      },
    });
  } catch (error) {
    debug("Check initialize error:", error);
    return handleApiError(error);
  }
}
