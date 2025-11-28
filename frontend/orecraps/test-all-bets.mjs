import { Connection, Keypair, Transaction, SystemProgram, PublicKey } from "@solana/web3.js";
import fs from "fs";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const API_BASE = "http://localhost:3000/api";

// All bet types with proper parameters
const ALL_BET_TYPES = [
  { name: "PassLine", betType: "PassLine", point: 0, amount: 0.01 },
  { name: "DontPass", betType: "DontPass", point: 0, amount: 0.01 },
  { name: "Field", betType: "Field", point: 0, amount: 0.01 },
  { name: "AnySeven", betType: "AnySeven", point: 0, amount: 0.01 },
  { name: "AnyCraps", betType: "AnyCraps", point: 0, amount: 0.01 },
  { name: "YoEleven", betType: "YoEleven", point: 0, amount: 0.01 },
  { name: "Aces", betType: "Aces", point: 0, amount: 0.01 },
  { name: "Twelve", betType: "Twelve", point: 0, amount: 0.01 },
  // Place bets with valid points
  { name: "Place4", betType: "Place", point: 4, amount: 0.01 },
  { name: "Place5", betType: "Place", point: 5, amount: 0.01 },
  { name: "Place6", betType: "Place", point: 6, amount: 0.01 },
  { name: "Place8", betType: "Place", point: 8, amount: 0.01 },
  { name: "Place9", betType: "Place", point: 9, amount: 0.01 },
  { name: "Place10", betType: "Place", point: 10, amount: 0.01 },
  // Hardway bets with valid points
  { name: "Hard4", betType: "Hardway", point: 4, amount: 0.01 },
  { name: "Hard6", betType: "Hardway", point: 6, amount: 0.01 },
  { name: "Hard8", betType: "Hardway", point: 8, amount: 0.01 },
  { name: "Hard10", betType: "Hardway", point: 10, amount: 0.01 },
];

async function placeBet(bet) {
  const response = await fetch(`${API_BASE}/place-bet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bets: [{ betType: bet.betType, point: bet.point, amount: bet.amount }]
    })
  });
  const result = await response.json();
  return { ...result, betName: bet.name };
}

async function simulateRoll() {
  const response = await fetch(`${API_BASE}/simulate-roll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return response.json();
}

async function main() {
  console.log("============================================================");
  console.log("COMPREHENSIVE CRAPS BET TEST - 5 EPOCHS");
  console.log("============================================================");

  const results = {
    epochs: [],
    betsPlaced: { success: 0, failed: 0 },
    betResults: [],
  };

  for (let epoch = 1; epoch <= 5; epoch++) {
    console.log("\n============================================================");
    console.log("EPOCH " + epoch);
    console.log("============================================================");

    const epochResults = {
      epoch,
      betsPlaced: [],
      rolls: [],
    };

    // Select different bets for each epoch to cover all
    const startIdx = ((epoch - 1) * 4) % ALL_BET_TYPES.length;
    const betsForEpoch = ALL_BET_TYPES.slice(startIdx, startIdx + 4);

    // Place bets
    console.log("\n--- Placing " + betsForEpoch.length + " bets ---");
    for (const bet of betsForEpoch) {
      try {
        const result = await placeBet(bet);
        if (result.success) {
          console.log("  [OK] " + bet.name + ": Placed (sig: " + result.signature?.slice(0, 20) + "...)");
          results.betsPlaced.success++;
          epochResults.betsPlaced.push({ name: bet.name, success: true, signature: result.signature });
        } else {
          console.log("  [FAIL] " + bet.name + ": Failed - " + result.error);
          results.betsPlaced.failed++;
          epochResults.betsPlaced.push({ name: bet.name, success: false, error: result.error });
        }
      } catch (e) {
        console.log("  [ERR] " + bet.name + ": Error - " + e.message);
        results.betsPlaced.failed++;
        epochResults.betsPlaced.push({ name: bet.name, success: false, error: e.message });
      }
      // Small delay between bets
      await new Promise(r => setTimeout(r, 100));
    }

    // Roll dice 3 times per epoch
    console.log("\n--- Rolling dice 3 times ---");
    for (let roll = 1; roll <= 3; roll++) {
      const rollResult = await simulateRoll();
      const { die1, die2, sum } = rollResult;
      console.log("  Roll " + roll + ": " + die1 + " + " + die2 + " = " + sum);
      epochResults.rolls.push({ die1, die2, sum });
      await new Promise(r => setTimeout(r, 200));
    }

    results.epochs.push(epochResults);
  }

  // Summary
  console.log("\n============================================================");
  console.log("FINAL SUMMARY");
  console.log("============================================================");
  console.log("\nTotal bets attempted: " + (results.betsPlaced.success + results.betsPlaced.failed));
  console.log("  Successful: " + results.betsPlaced.success);
  console.log("  Failed: " + results.betsPlaced.failed);

  console.log("\nBet Results by Type:");
  const betTypeSummary = {};
  for (const epoch of results.epochs) {
    for (const bet of epoch.betsPlaced) {
      betTypeSummary[bet.name] = bet.success ? "PLACED" : "FAILED: " + (bet.error?.slice(0, 50) || "unknown");
    }
  }
  for (const [name, status] of Object.entries(betTypeSummary)) {
    console.log("  " + name + ": " + status);
  }

  console.log("\nDice Distribution:");
  const rollCounts = {};
  for (const epoch of results.epochs) {
    for (const roll of epoch.rolls) {
      rollCounts[roll.sum] = (rollCounts[roll.sum] || 0) + 1;
    }
  }
  for (let i = 2; i <= 12; i++) {
    const count = rollCounts[i] || 0;
    const bar = "*".repeat(count);
    console.log("  " + i.toString().padStart(2) + ": " + bar + " (" + count + ")");
  }

  return results;
}

main().catch(console.error);
