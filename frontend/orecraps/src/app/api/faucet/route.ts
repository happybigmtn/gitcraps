import { NextResponse } from "next/server";
import { spawnSync } from "child_process";
import { PublicKey } from "@solana/web3.js";
import { handleApiError } from "@/lib/apiErrorHandler";
import { createDebugger } from "@/lib/debug";
import { LOCALNET_RPC, getKeypairPath } from "@/lib/cliConfig";

const debug = createDebugger("Faucet");

// Token mints by network - RNG tokens for mining
// Must match RNG_MINT_ADDRESS in api/src/consts.rs
const RNG_MINTS = {
  localnet: "RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump",
  devnet: "8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs", // Real devnet mint
};

// CRAP token mints - for localnet testing only (so users can test craps bets)
const CRAP_MINTS = {
  localnet: "CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump",
};

const RPC_URLS = {
  localnet: LOCALNET_RPC,
  devnet: "https://api.devnet.solana.com",
};

// Amount to airdrop: 10 RNG tokens (devnet) or 100 RNG (localnet for testing)
const RNG_AIRDROP_AMOUNTS = {
  localnet: "100", // More for localnet testing
  devnet: "10",    // 10 RNG for first 1000 players
};

// CRAP airdrop amounts (localnet only - for testing craps bets)
const CRAP_AIRDROP_AMOUNTS = {
  localnet: "100", // 100 CRAP for testing craps bets
};

// First 1000 players limit for devnet
const MAX_DEVNET_CLAIMS = 1000;

// SECURITY: Rate limiting to prevent faucet abuse
const walletRequestTimes = new Map<string, number>();
const claimedWallets = new Set<string>(); // Track unique wallets for devnet limit
const FAUCET_COOLDOWN_MS = 60 * 1000; // 1 minute for localnet (fast iteration)

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

    // Validate network (support both localnet and devnet)
    if (network !== "localnet" && network !== "devnet") {
      return NextResponse.json(
        { success: false, error: "Faucet available on localnet and devnet only" },
        { status: 400 }
      );
    }

    // For devnet: check if already claimed (one-time only)
    if (network === "devnet") {
      if (claimedWallets.has(wallet)) {
        return NextResponse.json(
          { success: false, error: "You have already claimed your 10 RNG. Each wallet can only claim once." },
          { status: 400 }
        );
      }

      // Check if we've hit the 1000 player limit
      if (claimedWallets.size >= MAX_DEVNET_CLAIMS) {
        return NextResponse.json(
          { success: false, error: "Faucet limit reached. All 1000 allocations have been claimed." },
          { status: 400 }
        );
      }
    }

    // SECURITY: Rate limiting per wallet address (for localnet only, devnet is one-time)
    if (network === "localnet") {
      const lastRequest = walletRequestTimes.get(wallet);
      const now = Date.now();
      if (lastRequest && (now - lastRequest) < FAUCET_COOLDOWN_MS) {
        const minutesRemaining = Math.ceil((FAUCET_COOLDOWN_MS - (now - lastRequest)) / 60000);
        return NextResponse.json(
          { success: false, error: `Rate limited. Try again in ${minutesRemaining} minutes.` },
          { status: 429 }
        );
      }
    }

    const rpcUrl = RPC_URLS[network as keyof typeof RPC_URLS];
    const rngMint = RNG_MINTS[network as keyof typeof RNG_MINTS];
    const rngAirdropAmount = RNG_AIRDROP_AMOUNTS[network as keyof typeof RNG_AIRDROP_AMOUNTS];
    const crapMint = network === "localnet" ? CRAP_MINTS.localnet : null;
    const crapAirdropAmount = network === "localnet" ? CRAP_AIRDROP_AMOUNTS.localnet : null;

    debug(`Faucet request for wallet: ${wallet} on ${network}`);

    // First, airdrop SOL if needed for transaction fees (localnet only)
    // SECURITY: Using spawnSync with array args prevents command injection
    if (network === "localnet") {
      try {
        debug(`Airdropping SOL to: ${wallet}`);
        const airdropResult = runCommand('solana', ['airdrop', '2', wallet, '--url', rpcUrl]);
        if (airdropResult.success) {
          debug("SOL airdrop successful");
        } else {
          debug("SOL airdrop skipped:", airdropResult.stderr);
        }
      } catch (error) {
        debug("SOL airdrop skipped (may already have SOL):", error);
      }
    }

    // Create token account for user if it doesn't exist and mint tokens
    // Using spl-token commands with the admin keypair as mint authority

    // First get or create the ATA for the user
    // The --recipient flag specifies the wallet owner, tokens will be minted to their ATA
    let ataAddress = "";
    try {
      // Get the ATA address for this wallet and mint
      debug(`Checking ATA for: ${wallet}`);
      const ataCheckResult = runCommand('spl-token', ['accounts', rngMint, '--owner', wallet, '--url', rpcUrl]);
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
        const createAtaResult = runCommand('spl-token', ['create-account', rngMint, '--owner', wallet, '--fee-payer', keypairPath, '--url', rpcUrl]);
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

    // Mint RNG tokens to the user's ATA (use --recipient-owner to specify wallet)
    debug(`Minting ${rngAirdropAmount} RNG to: ${wallet}`);
    const rngMintResult = runCommand('spl-token', ['mint', rngMint, rngAirdropAmount, '--recipient-owner', wallet, '--url', rpcUrl]);

    debug("RNG Mint stdout:", rngMintResult.stdout);
    if (rngMintResult.stderr) {
      debug("RNG Mint stderr:", rngMintResult.stderr);
    }

    // Parse signature from RNG mint
    const rngSigMatch = rngMintResult.stdout.match(/Signature: (\w+)/i);
    const rngSignature = rngSigMatch ? rngSigMatch[1] : null;

    // For localnet: Also mint CRAP tokens so users can test craps bets immediately
    let crapSignature: string | null = null;
    if (network === "localnet" && crapMint && crapAirdropAmount) {
      // First, create the CRAP ATA if it doesn't exist
      debug(`Checking/creating CRAP ATA for: ${wallet}`);
      const keypairPath = getKeypairPath();
      const createCrapAtaResult = runCommand('spl-token', ['create-account', crapMint, '--owner', wallet, '--fee-payer', keypairPath, '--url', rpcUrl]);
      debug("CRAP ATA creation output:", createCrapAtaResult.stdout || createCrapAtaResult.stderr);

      // Now mint CRAP tokens
      debug(`Minting ${crapAirdropAmount} CRAP to: ${wallet}`);
      const crapMintResult = runCommand('spl-token', ['mint', crapMint, crapAirdropAmount, '--recipient-owner', wallet, '--url', rpcUrl]);

      debug("CRAP Mint stdout:", crapMintResult.stdout);
      if (crapMintResult.stderr) {
        debug("CRAP Mint stderr:", crapMintResult.stderr);
      }

      const crapSigMatch = crapMintResult.stdout.match(/Signature: (\w+)/i);
      crapSignature = crapSigMatch ? crapSigMatch[1] : null;
    }

    // Track claims
    const now = Date.now();
    if (network === "devnet") {
      claimedWallets.add(wallet);
      debug(`Devnet claims: ${claimedWallets.size}/${MAX_DEVNET_CLAIMS}`);
    } else {
      walletRequestTimes.set(wallet, now);
    }

    // Build response message
    const message = network === "localnet"
      ? `Airdropped ${rngAirdropAmount} RNG + ${crapAirdropAmount} CRAP tokens`
      : `Airdropped ${rngAirdropAmount} RNG tokens`;

    return NextResponse.json({
      success: true,
      message,
      signature: rngSignature,
      crapSignature: crapSignature || undefined,
      rngAmount: rngAirdropAmount,
      crapAmount: crapAirdropAmount || undefined,
      rngMint,
      crapMint: crapMint || undefined,
      network,
      claimsRemaining: network === "devnet" ? MAX_DEVNET_CLAIMS - claimedWallets.size : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
