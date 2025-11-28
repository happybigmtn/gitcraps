import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { PublicKey } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("Faucet");

const LOCALNET_RPC = "http://127.0.0.1:8899";
const LOCALNET_RNG_MINT = "RaBMafFSe53m9VU7CFf7ZWv7cQwUYFwBt926YZKLAVC";

/**
 * Get admin keypair path from environment
 * Throws error if not set to prevent insecure defaults
 */
function getKeypairPath(): string {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error(
      "ADMIN_KEYPAIR_PATH environment variable is required. " +
      "Set it to the path of your Solana keypair file for faucet operations."
    );
  }
  return keypairPath;
}

// Amount to airdrop: 1000 RNG tokens (with 9 decimals)
const AIRDROP_AMOUNT = "1000";

// Validate Solana address using PublicKey constructor
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Safe command execution using spawnSync with array arguments (no shell interpolation)
function runCommand(command: string, args: string[], timeout = 30000): { stdout: string; stderr: string; success: boolean } {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    timeout,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    success: result.status === 0,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { wallet, network } = body;

    if (!wallet) {
      return NextResponse.json(
        { success: false, error: "Wallet address required" },
        { status: 400 }
      );
    }

    // SECURITY: Validate wallet address format to prevent command injection
    if (!isValidSolanaAddress(wallet)) {
      return NextResponse.json(
        { success: false, error: "Invalid wallet address format" },
        { status: 400 }
      );
    }

    // Only allow faucet on localnet
    if (network !== "localnet") {
      return NextResponse.json(
        { success: false, error: "Faucet only available on localnet" },
        { status: 400 }
      );
    }

    debug(`Faucet request for wallet: ${wallet}`);

    // First, airdrop SOL if needed for transaction fees
    // SECURITY: Using spawnSync with array args prevents command injection
    try {
      debug(`Airdropping SOL to: ${wallet}`);
      const airdropResult = runCommand('solana', ['airdrop', '2', wallet, '--url', LOCALNET_RPC]);
      if (airdropResult.success) {
        debug("SOL airdrop successful");
      } else {
        debug("SOL airdrop skipped:", airdropResult.stderr);
      }
    } catch (error) {
      debug("SOL airdrop skipped (may already have SOL):", error);
    }

    // Create token account for user if it doesn't exist and mint tokens
    // Using spl-token commands with the admin keypair as mint authority

    // First get or create the ATA for the user
    // The --recipient flag specifies the wallet owner, tokens will be minted to their ATA
    let ataAddress = "";
    try {
      // Get the ATA address for this wallet and mint
      debug(`Checking ATA for: ${wallet}`);
      const ataCheckResult = runCommand('spl-token', ['accounts', LOCALNET_RNG_MINT, '--owner', wallet, '--url', LOCALNET_RPC]);
      debug("ATA check output:", ataCheckResult.stdout);

      // Parse ATA address from output if it exists
      const ataMatch = ataCheckResult.stdout.match(/([A-HJ-NP-Za-km-z1-9]{32,44})/);
      if (ataMatch) {
        ataAddress = ataMatch[1];
        debug(`Found existing ATA: ${ataAddress}`);
      }
    } catch {
      debug("No existing ATA found, will create one");
    }

    // If no ATA, create one
    if (!ataAddress) {
      debug(`Creating ATA for: ${wallet}`);
      try {
        const keypairPath = getKeypairPath();
        const createAtaResult = runCommand('spl-token', ['create-account', LOCALNET_RNG_MINT, '--owner', wallet, '--fee-payer', keypairPath, '--url', LOCALNET_RPC]);
        debug("ATA creation output:", createAtaResult.stdout);
        const ataMatch = createAtaResult.stdout.match(/Creating account ([A-HJ-NP-Za-km-z1-9]{32,44})/);
        if (ataMatch) {
          ataAddress = ataMatch[1];
        }
      } catch (e) {
        // ATA might already exist
        debug("ATA creation result:", e);
      }
    }

    // Mint tokens to the user's ATA (use --recipient-owner to specify wallet)
    debug(`Minting RNG to: ${wallet}`);
    const mintResult = runCommand('spl-token', ['mint', LOCALNET_RNG_MINT, AIRDROP_AMOUNT, '--recipient-owner', wallet, '--url', LOCALNET_RPC]);

    debug("Mint stdout:", mintResult.stdout);
    if (mintResult.stderr) {
      debug("Mint stderr:", mintResult.stderr);
    }

    const stdout = mintResult.stdout;

    // Parse signature from output
    const sigMatch = stdout.match(/Signature: (\w+)/i);
    const signature = sigMatch ? sigMatch[1] : null;

    return NextResponse.json({
      success: true,
      message: `Airdropped ${AIRDROP_AMOUNT} RNG tokens`,
      signature,
      amount: AIRDROP_AMOUNT,
      mint: LOCALNET_RNG_MINT,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
