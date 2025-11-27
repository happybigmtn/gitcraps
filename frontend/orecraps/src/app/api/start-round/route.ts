import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("StartRound");

// CLI path relative to the project root (workspace target directory)
const CLI_PATH = path.resolve(process.cwd(), "../../target/release/ore-cli");
const KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
const DEVNET_RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";
const LOCALNET_RPC = "http://127.0.0.1:8899";

// Generate a fair dice roll (two 6-sided dice) using cryptographically secure RNG
function rollDice(): { die1: number; die2: number; sum: number; square: number } {
  // Use crypto.getRandomValues() for secure random number generation
  const randomBytes = new Uint32Array(2);
  crypto.getRandomValues(randomBytes);

  // Convert to 1-6 range
  const die1 = (randomBytes[0] % 6) + 1;
  const die2 = (randomBytes[1] % 6) + 1;
  const sum = die1 + die2;
  // Square index: (die1 - 1) * 6 + (die2 - 1)
  const square = (die1 - 1) * 6 + (die2 - 1);
  return { die1, die2, sum, square };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const duration = body.duration || 300; // Default 300 slots (~2 minutes)
    const network = body.network || "devnet";
    // Simulated mode: default to true for localnet, can be overridden
    const simulated = body.simulated !== undefined ? body.simulated : (network === "localnet");

    const rpcEndpoint = network === "localnet" ? LOCALNET_RPC : DEVNET_RPC;

    debug(`Starting round with duration ${duration} slots on ${network}...`);
    debug(`Simulated: ${simulated}`);

    // Simulated mode - generate random dice roll without CLI
    if (simulated) {
      const roll = rollDice();
      debug(`Simulated roll: ${roll.die1}-${roll.die2} = ${roll.sum} (square ${roll.square})`);

      return NextResponse.json({
        success: true,
        message: "Simulated round completed",
        simulated: true,
        roll: {
          die1: roll.die1,
          die2: roll.die2,
          sum: roll.sum,
          square: roll.square,
        },
        signature: `sim_${Date.now().toString(36)}`,
      });
    }

    debug(`CLI Path: ${CLI_PATH}`);
    debug(`Keypair: ${KEYPAIR_PATH}`);
    debug(`RPC: ${rpcEndpoint}`);

    // Execute the CLI command using spawnSync for security (no shell interpolation)
    const result = spawnSync(CLI_PATH, [], {
      timeout: 60000,
      encoding: 'utf-8',
      env: {
        ...process.env,
        COMMAND: "start_round",
        DURATION: String(duration),
        RPC: rpcEndpoint,
        KEYPAIR: KEYPAIR_PATH,
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
      return NextResponse.json(
        {
          success: false,
          error: "CLI command failed",
          details: stderr,
        },
        { status: 500 }
      );
    }

    // Parse signature from output if available
    const sigMatch = stdout.match(/transaction: (\w+)/i) || stdout.match(/signature: (\w+)/i);
    const signature = sigMatch ? sigMatch[1] : null;

    return NextResponse.json({
      success: true,
      message: "Round started successfully",
      signature,
      output: stdout,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
