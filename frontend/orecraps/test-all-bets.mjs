// No @solana/kit imports needed - this script only uses HTTP API calls

const LOCALNET_RPC = "http://127.0.0.1:8899";
const API_BASE = "http://localhost:3000/api";

// CrapsBetType enum values (from src/lib/program.ts)
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  PassOdds: 2,
  DontPassOdds: 3,
  Come: 4,
  DontCome: 5,
  ComeOdds: 6,
  DontComeOdds: 7,
  Place: 8,
  Hardway: 9,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
};

// All bet types with proper parameters (using numeric betType values)
const ALL_BET_TYPES = [
  // Line bets (made on come-out roll)
  { name: "PassLine", betType: CrapsBetType.PassLine, point: 0, amount: 0.01 },
  { name: "DontPass", betType: CrapsBetType.DontPass, point: 0, amount: 0.01 },
  // Come bets (require a point - works like Pass/DontPass on that specific point)
  { name: "Come4", betType: CrapsBetType.Come, point: 4, amount: 0.01 },
  { name: "Come5", betType: CrapsBetType.Come, point: 5, amount: 0.01 },
  { name: "DontCome6", betType: CrapsBetType.DontCome, point: 6, amount: 0.01 },
  { name: "DontCome8", betType: CrapsBetType.DontCome, point: 8, amount: 0.01 },
  // Single-roll bets (can be placed anytime)
  { name: "Field", betType: CrapsBetType.Field, point: 0, amount: 0.01 },
  { name: "AnySeven", betType: CrapsBetType.AnySeven, point: 0, amount: 0.01 },
  { name: "AnyCraps", betType: CrapsBetType.AnyCraps, point: 0, amount: 0.01 },
  { name: "YoEleven", betType: CrapsBetType.YoEleven, point: 0, amount: 0.01 },
  { name: "Aces", betType: CrapsBetType.Aces, point: 0, amount: 0.01 },
  { name: "Twelve", betType: CrapsBetType.Twelve, point: 0, amount: 0.01 },
  // Place bets with valid points
  { name: "Place4", betType: CrapsBetType.Place, point: 4, amount: 0.01 },
  { name: "Place5", betType: CrapsBetType.Place, point: 5, amount: 0.01 },
  { name: "Place6", betType: CrapsBetType.Place, point: 6, amount: 0.01 },
  { name: "Place8", betType: CrapsBetType.Place, point: 8, amount: 0.01 },
  { name: "Place9", betType: CrapsBetType.Place, point: 9, amount: 0.01 },
  { name: "Place10", betType: CrapsBetType.Place, point: 10, amount: 0.01 },
  // Hardway bets with valid points (4, 6, 8, 10 - even numbers that can be rolled as pairs)
  { name: "Hard4", betType: CrapsBetType.Hardway, point: 4, amount: 0.01 },
  { name: "Hard6", betType: CrapsBetType.Hardway, point: 6, amount: 0.01 },
  { name: "Hard8", betType: CrapsBetType.Hardway, point: 8, amount: 0.01 },
  { name: "Hard10", betType: CrapsBetType.Hardway, point: 10, amount: 0.01 },
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

async function main() {
  console.log("============================================================");
  console.log("COMPREHENSIVE CRAPS BET PLACEMENT TEST");
  console.log("============================================================");
  console.log("Testing " + ALL_BET_TYPES.length + " bet types...\n");

  const results = {
    betsPlaced: { success: 0, failed: 0 },
    betResults: {},
  };

  // Test each bet type individually
  for (const bet of ALL_BET_TYPES) {
    try {
      const result = await placeBet(bet);
      if (result.success) {
        console.log("  [OK] " + bet.name + ": Placed (sig: " + result.signature?.slice(0, 20) + "...)");
        results.betsPlaced.success++;
        results.betResults[bet.name] = { success: true, signature: result.signature };
      } else {
        console.log("  [FAIL] " + bet.name + ": " + (result.error || "Unknown error"));
        results.betsPlaced.failed++;
        results.betResults[bet.name] = { success: false, error: result.error };
      }
    } catch (e) {
      console.log("  [ERR] " + bet.name + ": " + e.message);
      results.betsPlaced.failed++;
      results.betResults[bet.name] = { success: false, error: e.message };
    }
    // Delay between bets to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log("\n============================================================");
  console.log("FINAL SUMMARY");
  console.log("============================================================");
  console.log("\nTotal bets attempted: " + (results.betsPlaced.success + results.betsPlaced.failed));
  console.log("  Successful: " + results.betsPlaced.success);
  console.log("  Failed: " + results.betsPlaced.failed);
  console.log("  Success rate: " + ((results.betsPlaced.success / ALL_BET_TYPES.length) * 100).toFixed(1) + "%");

  console.log("\nBet Results by Type:");
  for (const [name, result] of Object.entries(results.betResults)) {
    const status = result.success ? "PLACED" : "FAILED: " + (result.error?.slice(0, 50) || "unknown");
    console.log("  " + name + ": " + status);
  }

  return results;
}

main().catch(console.error);
