import { NextResponse } from "next/server";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import path from "path";
import { handleApiError } from "@/lib/apiErrorHandler";

// Development-only debug logging (stripped in production)
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.log("[Localnet]", ...args);
  }
};

const execAsync = promisify(exec);

const SCRIPT_PATH = path.resolve(process.cwd(), "../../scripts/localnet-setup.sh");
const KEYPAIR_PATH = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";

// Check if localnet validator is running
async function isValidatorRunning(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("pgrep -f solana-test-validator", { timeout: 5000 });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

// Check localnet health
async function checkHealth(): Promise<{ healthy: boolean; version?: string }> {
  try {
    const healthController = new AbortController();
    const healthTimeout = setTimeout(() => healthController.abort(), 5000);

    const response = await fetch("http://127.0.0.1:8899", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getHealth",
      }),
      signal: healthController.signal,
    });
    clearTimeout(healthTimeout);
    const data = await response.json();

    if (data.result === "ok") {
      // Get version
      const versionController = new AbortController();
      const versionTimeout = setTimeout(() => versionController.abort(), 5000);

      const versionRes = await fetch("http://127.0.0.1:8899", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getVersion",
        }),
        signal: versionController.signal,
      });
      clearTimeout(versionTimeout);
      const versionData = await versionRes.json();
      return { healthy: true, version: versionData.result?.["solana-core"] };
    }
    return { healthy: false };
  } catch {
    return { healthy: false };
  }
}

export async function GET() {
  try {
    const running = await isValidatorRunning();
    const health = await checkHealth();

    return NextResponse.json({
      running,
      healthy: health.healthy,
      version: health.version,
      rpcUrl: "http://127.0.0.1:8899",
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "start";

    debug(`Localnet action: ${action}`);

    switch (action) {
      case "start": {
        // Check if already running
        const running = await isValidatorRunning();
        if (running) {
          const health = await checkHealth();
          return NextResponse.json({
            success: true,
            message: "Validator already running",
            ...health,
          });
        }

        // Start the validator using the script
        const { stdout, stderr } = await execAsync(
          `KEYPAIR="${KEYPAIR_PATH}" "${SCRIPT_PATH}" start`,
          { timeout: 60000 }
        );

        debug("Localnet start stdout:", stdout);
        if (stderr) debug("Localnet start stderr:", stderr);

        // Wait a moment for validator to stabilize
        await new Promise((r) => setTimeout(r, 2000));
        const health = await checkHealth();

        return NextResponse.json({
          success: health.healthy,
          message: health.healthy ? "Validator started" : "Validator may not be ready",
          output: stdout,
          ...health,
        });
      }

      case "stop": {
        const { stdout, stderr } = await execAsync(
          `"${SCRIPT_PATH}" stop`,
          { timeout: 10000 }
        );

        return NextResponse.json({
          success: true,
          message: "Validator stopped",
          output: stdout,
        });
      }

      case "setup": {
        // Full setup - build, start, fund, initialize
        const { stdout, stderr } = await execAsync(
          `KEYPAIR="${KEYPAIR_PATH}" "${SCRIPT_PATH}" setup`,
          { timeout: 180000 } // 3 minutes for full setup
        );

        debug("Localnet setup stdout:", stdout);
        if (stderr) debug("Localnet setup stderr:", stderr);

        const health = await checkHealth();

        return NextResponse.json({
          success: health.healthy,
          message: "Setup complete",
          output: stdout,
          ...health,
        });
      }

      case "status": {
        const running = await isValidatorRunning();
        const health = await checkHealth();

        return NextResponse.json({
          success: true,
          running,
          ...health,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    return handleApiError(error);
  }
}
