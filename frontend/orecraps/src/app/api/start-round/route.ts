import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// CLI path relative to the project root (workspace target directory)
const CLI_PATH = path.resolve(process.cwd(), "../../target/release/ore-cli");
const KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const duration = body.duration || 300; // Default 300 slots (~2 minutes)

    console.log(`Starting round with duration ${duration} slots...`);
    console.log(`CLI Path: ${CLI_PATH}`);
    console.log(`Keypair: ${KEYPAIR_PATH}`);

    // Execute the CLI command
    const command = `COMMAND=start_round DURATION=${duration} RPC="${RPC_ENDPOINT}" KEYPAIR="${KEYPAIR_PATH}" "${CLI_PATH}"`;

    const { stdout, stderr } = await execAsync(command, {
      timeout: 60000, // 60 second timeout
      env: {
        ...process.env,
        COMMAND: "start_round",
        DURATION: String(duration),
        RPC: RPC_ENDPOINT,
        KEYPAIR: KEYPAIR_PATH,
      },
    });

    console.log("CLI stdout:", stdout);
    if (stderr) {
      console.log("CLI stderr:", stderr);
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
    console.error("Start round error:", error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const stderr = (error as { stderr?: string }).stderr || "";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        details: stderr,
      },
      { status: 500 }
    );
  }
}
