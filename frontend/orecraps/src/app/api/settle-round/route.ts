import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { validateAdminToken } from "@/lib/adminAuth";
import { CLI_PATH, LOCALNET_RPC, DEVNET_RPC, getKeypairPath, getRpcEndpoint } from "@/lib/cliConfig";

const debug = createDebugger("SettleRound");

/**
 * Settle the current mining round on-chain.
 * This calls the CLI "reset" command which:
 * 1. Samples entropy
 * 2. Reveals the random seed
 * 3. Calculates the winning square and dice roll
 * 4. Resets the board for the next round
 */
export async function POST(request: Request) {
  // Validate admin authentication
  const authResult = validateAdminToken(request);
  if (!authResult.authorized) {
    return authResult.response;
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Use server-side network configuration instead of trusting client
    const ALLOWED_NETWORK = process.env.SOLANA_NETWORK || 'localnet';
    const rpcEndpoint = getRpcEndpoint(ALLOWED_NETWORK);

    const keypairPath = getKeypairPath();

    debug(`Settling round on ${ALLOWED_NETWORK}...`);
    debug(`CLI Path: ${CLI_PATH}`);
    debug(`Keypair: ${keypairPath}`);
    debug(`RPC: ${rpcEndpoint}`);

    // Execute the CLI command using spawnSync for security (no shell interpolation)
    const result = spawnSync(CLI_PATH, [], {
      timeout: 60000,
      encoding: 'utf-8',
      env: {
        ...process.env,
        COMMAND: "reset",
        RPC: rpcEndpoint,
        KEYPAIR: keypairPath,
      },
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    debug("CLI stdout:", stdout);
    if (stderr) {
      debug("CLI stderr:", stderr);
    }

    // Check for execution errors
    if (result.status !== 0) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      console.error('CLI command failed:', stderr || stdout); // Always log internally

      return NextResponse.json(
        {
          success: false,
          error: "CLI command failed",
          ...(isDevelopment && { details: stderr || stdout }),
        },
        { status: 500 }
      );
    }

    // Parse signature from output if available
    const sigMatch = stdout.match(/Reset: (\w+)/i) || stdout.match(/transaction: (\w+)/i) || stdout.match(/signature: (\w+)/i);
    const signature = sigMatch ? sigMatch[1] : null;

    // Parse dice roll from output if available
    const diceMatch = stdout.match(/Dice roll: (\d+) \+ (\d+) = (\d+)/);
    const diceResults = diceMatch ? {
      die1: parseInt(diceMatch[1]),
      die2: parseInt(diceMatch[2]),
      sum: parseInt(diceMatch[3]),
    } : null;

    // Parse winning square
    const squareMatch = stdout.match(/Winning square: (\d+)/);
    const winningSquare = squareMatch ? parseInt(squareMatch[1]) : null;

    return NextResponse.json({
      success: true,
      message: "Round settled successfully",
      signature,
      diceResults,
      winningSquare,
      output: stdout,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
