import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { handleApiError } from "@/lib/apiErrorHandler";

// CLI path relative to the project root (workspace target directory)
const CLI_PATH = path.resolve(process.cwd(), "../../target/release/ore-cli");

// SECURITY: RPC endpoint must come from environment variable, no hardcoded API keys
const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

/**
 * Get admin keypair path from environment
 * Throws error if not set to prevent insecure defaults
 */
function getKeypairPath(): string {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error(
      "ADMIN_KEYPAIR_PATH environment variable is required. " +
      "Set it to the path of your Solana keypair file for CLI operations."
    );
  }
  return keypairPath;
}

export async function POST() {
  try {
    const keypairPath = getKeypairPath();

    // Execute the CLI command using spawnSync for security (no shell interpolation)
    const result = spawnSync(CLI_PATH, [], {
      timeout: 60000,
      encoding: 'utf-8',
      env: {
        ...process.env,
        COMMAND: "reset",
        RPC: RPC_ENDPOINT,
        KEYPAIR: keypairPath,
      },
    });

    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

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
      message: "Round reset successfully",
      signature,
      output: stdout,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
