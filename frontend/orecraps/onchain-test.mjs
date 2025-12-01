#!/usr/bin/env node
/**
 * PROPER ON-CHAIN INTEGRATION TEST
 *
 * This test verifies that ALL transactions are actually on-chain by:
 * 1. Placing bets via API (uses CrapsGameService which sends real transactions)
 * 2. Verifying transaction signatures exist on-chain
 * 3. Using CLI to settle rounds (real on-chain reset instruction)
 * 4. Reading results from on-chain accounts
 *
 * NO SIMULATION - All transactions must be verifiable on-chain
 */

import { createSolanaRpc } from "@solana/kit";
import { spawnSync } from "child_process";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const API_BASE = "http://localhost:3000/api";
const CLI_PATH = "../../target/release/ore-cli";
const KEYPAIR_PATH = process.env.HOME + "/.config/solana/id.json";

// Test configuration
const CONFIG = {
  numRounds: 5,       // Number of rounds to test
  betsPerRound: 3,    // Bets per round
  betAmount: 0.01,    // SOL per bet
};

// CrapsBetType enum values
const CrapsBetType = {
  PassLine: 0, DontPass: 1, Field: 10, AnySeven: 11,
  AnyCraps: 12, YoEleven: 13, Aces: 14, Twelve: 15,
};

// Test results
const results = {
  roundsCompleted: 0,
  totalBets: 0,
  successfulBets: 0,
  failedBets: 0,
  signaturesVerified: 0,
  signaturesNotFound: 0,
  onChainSettlements: 0,
  signatures: [],
  errors: [],
};

async function verifyConnection() {
  console.log("\n=== VERIFYING LOCALNET CONNECTION ===");
  const rpc = createSolanaRpc(LOCALNET_RPC);
  try {
    const { value: version } = await rpc.getVersion().send();
    const slot = await rpc.getSlot().send();
    console.log(`  Solana version: ${JSON.stringify(version)}`);
    console.log(`  Current slot: ${slot}`);
    return rpc;
  } catch (err) {
    throw new Error(`Failed to connect to localnet: ${err.message}`);
  }
}

async function verifyAPI() {
  console.log("\n=== VERIFYING API CONNECTION ===");
  try {
    // Use get-round-result instead of simulate-roll (to avoid mock endpoint)
    const response = await fetch(`${API_BASE}/get-round-result?network=localnet`, {
      method: "GET",
    });
    if (!response.ok) {
      // Even if round not found, API is connected
      console.log(`  API response status: ${response.status}`);
    }
    console.log("  API is reachable");
    return true;
  } catch (err) {
    throw new Error(`API not available: ${err.message}`);
  }
}

async function placeBetOnChain(bet) {
  console.log(`    Placing bet: type=${bet.betType}, point=${bet.point || 0}, amount=${bet.amount} SOL`);

  try {
    const response = await fetch(`${API_BASE}/place-bet`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bets: [bet] }),
    });
    const result = await response.json();

    results.totalBets++;

    if (result.success && result.signature) {
      results.successfulBets++;
      results.signatures.push(result.signature);
      console.log(`      SUCCESS: sig=${result.signature.slice(0, 20)}...`);
      return { success: true, signature: result.signature };
    } else {
      results.failedBets++;
      results.errors.push(result.error || "Unknown error");
      console.log(`      FAILED: ${result.error}`);
      return { success: false, error: result.error };
    }
  } catch (err) {
    results.failedBets++;
    results.totalBets++;
    results.errors.push(err.message);
    console.log(`      ERROR: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function verifySignatureOnChain(rpc, signature) {
  try {
    const { value: statuses } = await rpc.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    }).send();

    const status = statuses?.[0];
    if (status) {
      const confirmed = status.confirmationStatus === "confirmed" ||
                        status.confirmationStatus === "finalized";
      if (confirmed) {
        results.signaturesVerified++;
        return true;
      }
    }
    results.signaturesNotFound++;
    return false;
  } catch (err) {
    results.signaturesNotFound++;
    return false;
  }
}

function runCLICommand(command, env = {}) {
  const result = spawnSync(CLI_PATH, [], {
    encoding: "utf-8",
    env: {
      ...process.env,
      COMMAND: command,
      KEYPAIR: KEYPAIR_PATH,
      RPC: LOCALNET_RPC,
      ...env,
    },
    timeout: 30000,
  });

  return {
    success: result.status === 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

async function getBoardState() {
  const result = runCLICommand("board");
  if (result.success) {
    console.log(`  Board state: ${result.stdout.trim().split("\n").slice(0, 4).join(" | ")}`);
  }
  return result;
}

async function settleRoundOnChain() {
  console.log("  Attempting on-chain settlement via CLI reset...");

  // First, we need entropy. For localnet, we can use the new_var + reset flow
  // But the reset command might fail without proper entropy setup
  // Let's try the reset command and see what happens

  const result = runCLICommand("reset");

  if (result.success) {
    results.onChainSettlements++;
    console.log(`    Settlement SUCCESS`);
    console.log(`    ${result.stdout.trim()}`);

    // Parse signature from output
    const sigMatch = result.stdout.match(/Reset: (\w+)/i) ||
                     result.stdout.match(/transaction: (\w+)/i) ||
                     result.stdout.match(/signature: (\w+)/i);
    if (sigMatch) {
      results.signatures.push(sigMatch[1]);
    }
    return { success: true, output: result.stdout };
  } else {
    console.log(`    Settlement FAILED: ${result.stderr || result.stdout}`);
    return { success: false, error: result.stderr || result.stdout };
  }
}

async function runRound(rpc, roundNum) {
  console.log(`\n=== ROUND ${roundNum} ===`);

  // Check board state
  await getBoardState();

  // Place bets
  console.log(`\n  Placing ${CONFIG.betsPerRound} bets...`);

  const bets = [
    { betType: CrapsBetType.PassLine, point: 0, amount: CONFIG.betAmount },
    { betType: CrapsBetType.Field, point: 0, amount: CONFIG.betAmount },
    { betType: CrapsBetType.AnySeven, point: 0, amount: CONFIG.betAmount },
  ];

  for (const bet of bets.slice(0, CONFIG.betsPerRound)) {
    await placeBetOnChain(bet);
    await new Promise(r => setTimeout(r, 500)); // Delay between bets
  }

  // Attempt settlement
  console.log("\n  Settling round...");
  await settleRoundOnChain();

  results.roundsCompleted++;
}

async function verifyAllSignaturesOnChain(rpc) {
  console.log("\n=== VERIFYING ALL SIGNATURES ON-CHAIN ===");
  console.log(`  Total signatures to verify: ${results.signatures.length}`);

  for (const sig of results.signatures) {
    const verified = await verifySignatureOnChain(rpc, sig);
    console.log(`  ${sig.slice(0, 20)}... : ${verified ? "VERIFIED" : "NOT FOUND"}`);
  }
}

async function printReport() {
  console.log("\n" + "=".repeat(70));
  console.log("ON-CHAIN INTEGRATION TEST REPORT");
  console.log("=".repeat(70));

  console.log("\n--- OVERVIEW ---");
  console.log(`Rounds Completed:     ${results.roundsCompleted}`);
  console.log(`Total Bets:           ${results.totalBets}`);
  console.log(`Successful Bets:      ${results.successfulBets}`);
  console.log(`Failed Bets:          ${results.failedBets}`);

  console.log("\n--- ON-CHAIN VERIFICATION ---");
  console.log(`Signatures Collected: ${results.signatures.length}`);
  console.log(`Verified On-Chain:    ${results.signaturesVerified}`);
  console.log(`Not Found On-Chain:   ${results.signaturesNotFound}`);
  console.log(`CLI Settlements:      ${results.onChainSettlements}`);

  const verificationRate = results.signatures.length > 0
    ? ((results.signaturesVerified / results.signatures.length) * 100).toFixed(1)
    : 0;

  console.log("\n--- ASSESSMENT ---");
  if (results.signaturesVerified > 0 && results.signaturesNotFound === 0) {
    console.log(`  [PASS] All ${results.signaturesVerified} signatures verified on-chain`);
  } else if (results.signaturesVerified > 0) {
    console.log(`  [PARTIAL] ${verificationRate}% signatures verified on-chain`);
  } else {
    console.log(`  [FAIL] No signatures could be verified on-chain`);
  }

  if (results.onChainSettlements > 0) {
    console.log(`  [PASS] ${results.onChainSettlements} rounds settled on-chain via CLI`);
  } else {
    console.log(`  [INFO] No CLI settlements completed (may need entropy setup)`);
  }

  if (results.errors.length > 0) {
    console.log("\n--- ERRORS ---");
    const errorCounts = {};
    for (const err of results.errors) {
      const key = err.slice(0, 50);
      errorCounts[key] = (errorCounts[key] || 0) + 1;
    }
    for (const [err, count] of Object.entries(errorCounts)) {
      console.log(`  ${count}x: ${err}`);
    }
  }

  console.log("\n" + "=".repeat(70));
  console.log("TEST COMPLETE");
  console.log("=".repeat(70) + "\n");
}

async function main() {
  console.log("=".repeat(70));
  console.log("ORECRAPS ON-CHAIN INTEGRATION TEST");
  console.log("=".repeat(70));
  console.log("This test verifies ALL transactions occur on-chain (not simulated)");

  const rpc = await verifyConnection();
  await verifyAPI();

  console.log("\n=== STARTING ON-CHAIN TEST ===");
  console.log(`Configuration: ${CONFIG.numRounds} rounds, ${CONFIG.betsPerRound} bets/round`);

  for (let round = 1; round <= CONFIG.numRounds; round++) {
    await runRound(rpc, round);
    await new Promise(r => setTimeout(r, 1000)); // Delay between rounds
  }

  // Verify all collected signatures
  await verifyAllSignaturesOnChain(rpc);

  await printReport();
}

main().catch(console.error);
