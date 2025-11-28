import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import path from "path";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("Localnet");

const SCRIPT_PATH = path.resolve(process.cwd(), "../../scripts/localnet-setup.sh");

/**
 * Get admin keypair path from environment
 * Throws error if not set to prevent insecure defaults
 */
function getKeypairPath(): string {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error(
      "ADMIN_KEYPAIR_PATH environment variable is required. " +
      "Set it to the path of your Solana keypair file for localnet operations."
    );
  }
  return keypairPath;
}

// Check if localnet validator is running
async function isValidatorRunning(): Promise<boolean> {
  try {
    const result = spawnSync("pgrep", ["-f", "solana-test-validator"], {
      timeout: 5000,
      encoding: "utf-8",
    });

    if (result.error) {
      return false;
    }

    return result.stdout.trim().length > 0;
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
        const keypairPath = getKeypairPath();
        const result = spawnSync(SCRIPT_PATH, ["start"], {
          timeout: 60000,
          encoding: "utf-8",
          env: {
            ...process.env,
            KEYPAIR: keypairPath,
          },
        });

        if (result.error) {
          throw result.error;
        }
        if (result.status !== 0) {
          throw new Error(`Process failed: ${result.stderr}`);
        }

        const stdout = result.stdout;
        debug("Localnet start stdout:", stdout);
        if (result.stderr) debug("Localnet start stderr:", result.stderr);

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
        const result = spawnSync(SCRIPT_PATH, ["stop"], {
          timeout: 10000,
          encoding: "utf-8",
        });

        if (result.error) {
          throw result.error;
        }
        if (result.status !== 0) {
          throw new Error(`Process failed: ${result.stderr}`);
        }

        return NextResponse.json({
          success: true,
          message: "Validator stopped",
          output: result.stdout,
        });
      }

      case "setup": {
        // Full setup - build, start, fund, initialize
        const keypairPath = getKeypairPath();
        const result = spawnSync(SCRIPT_PATH, ["setup"], {
          timeout: 180000, // 3 minutes for full setup
          encoding: "utf-8",
          env: {
            ...process.env,
            KEYPAIR: keypairPath,
          },
        });

        if (result.error) {
          throw result.error;
        }
        if (result.status !== 0) {
          throw new Error(`Process failed: ${result.stderr}`);
        }

        const stdout = result.stdout;
        debug("Localnet setup stdout:", stdout);
        if (result.stderr) debug("Localnet setup stderr:", result.stderr);

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
