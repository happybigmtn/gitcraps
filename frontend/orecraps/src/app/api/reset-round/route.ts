import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { handleApiError } from "@/lib/apiErrorHandler";
import { CLI_PATH, DEVNET_RPC, getKeypairPath } from "@/lib/cliConfig";

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
        RPC: DEVNET_RPC,
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
