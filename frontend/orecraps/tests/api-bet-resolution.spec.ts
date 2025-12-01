import { test, expect } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "/tmp/craps-api-test";

// CrapsBetType enum values from program.ts
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

interface DiceResult {
  die1: number;
  die2: number;
  sum: number;
  winningSquare: number;
}

interface PlaceBetResponse {
  success: boolean;
  signature?: string;
  error?: string;
  betsPlaced?: number;
}

interface SettleRoundResponse {
  success: boolean;
  diceResults?: DiceResult;
  winningSquare?: number;
  signatures?: {
    open: string;
    sample: string;
    reveal: string;
  };
  error?: string;
}

interface BetConfig {
  name: string;
  betType: number;
  point: number;
  amount: number;
}

// Bet configurations for testing
const LINE_BETS: BetConfig[] = [
  { name: "Pass Line", betType: CrapsBetType.PassLine, point: 0, amount: 0.1 },
  { name: "Don't Pass", betType: CrapsBetType.DontPass, point: 0, amount: 0.1 },
];

const PLACE_BETS: BetConfig[] = [
  { name: "Place 4", betType: CrapsBetType.Place, point: 4, amount: 0.1 },
  { name: "Place 5", betType: CrapsBetType.Place, point: 5, amount: 0.1 },
  { name: "Place 6", betType: CrapsBetType.Place, point: 6, amount: 0.1 },
  { name: "Place 8", betType: CrapsBetType.Place, point: 8, amount: 0.1 },
  { name: "Place 9", betType: CrapsBetType.Place, point: 9, amount: 0.1 },
  { name: "Place 10", betType: CrapsBetType.Place, point: 10, amount: 0.1 },
];

const PROP_BETS: BetConfig[] = [
  { name: "Field", betType: CrapsBetType.Field, point: 0, amount: 0.1 },
  { name: "Any Seven", betType: CrapsBetType.AnySeven, point: 0, amount: 0.1 },
  { name: "Any Craps", betType: CrapsBetType.AnyCraps, point: 0, amount: 0.1 },
  { name: "Yo Eleven", betType: CrapsBetType.YoEleven, point: 0, amount: 0.1 },
  { name: "Aces", betType: CrapsBetType.Aces, point: 0, amount: 0.1 },
  { name: "Twelve", betType: CrapsBetType.Twelve, point: 0, amount: 0.1 },
];

const HARDWAY_BETS: BetConfig[] = [
  { name: "Hard 4", betType: CrapsBetType.Hardway, point: 4, amount: 0.1 },
  { name: "Hard 6", betType: CrapsBetType.Hardway, point: 6, amount: 0.1 },
  { name: "Hard 8", betType: CrapsBetType.Hardway, point: 8, amount: 0.1 },
  { name: "Hard 10", betType: CrapsBetType.Hardway, point: 10, amount: 0.1 },
];

// Helper functions
async function placeBet(baseUrl: string, bets: BetConfig[]): Promise<PlaceBetResponse> {
  const apiUrl = `${baseUrl}/api/place-bet`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bets: bets.map(b => ({
        betType: b.betType,
        point: b.point,
        amount: b.amount,
      })),
    }),
  });
  return response.json();
}

async function settleRound(baseUrl: string): Promise<SettleRoundResponse> {
  const apiUrl = `${baseUrl}/api/settle-round`;
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return response.json();
}

function evaluateBetOutcome(bet: BetConfig, diceResult: DiceResult): string {
  const { sum } = diceResult;
  const isHardway = diceResult.die1 === diceResult.die2;

  switch (bet.betType) {
    case CrapsBetType.PassLine:
      if (sum === 7 || sum === 11) return "WIN (natural)";
      if (sum === 2 || sum === 3 || sum === 12) return "LOSE (craps)";
      return `POINT ESTABLISHED: ${sum}`;

    case CrapsBetType.DontPass:
      if (sum === 2 || sum === 3) return "WIN (craps)";
      if (sum === 12) return "PUSH (barred)";
      if (sum === 7 || sum === 11) return "LOSE (natural)";
      return `POINT ESTABLISHED: ${sum}`;

    case CrapsBetType.Field:
      if ([2, 3, 4, 9, 10, 11, 12].includes(sum)) {
        if (sum === 2 || sum === 12) return "WIN (2x)";
        return "WIN (1x)";
      }
      return "LOSE";

    case CrapsBetType.AnySeven:
      return sum === 7 ? "WIN (4:1)" : "LOSE";

    case CrapsBetType.AnyCraps:
      return [2, 3, 12].includes(sum) ? "WIN (7:1)" : "LOSE";

    case CrapsBetType.YoEleven:
      return sum === 11 ? "WIN (15:1)" : "LOSE";

    case CrapsBetType.Aces:
      return sum === 2 ? "WIN (30:1)" : "LOSE";

    case CrapsBetType.Twelve:
      return sum === 12 ? "WIN (30:1)" : "LOSE";

    case CrapsBetType.Place:
      if (sum === bet.point) return `WIN on ${bet.point}`;
      if (sum === 7) return "LOSE (seven-out)";
      return "PENDING (no action)";

    case CrapsBetType.Hardway:
      if (sum === bet.point && isHardway) return `WIN (hard ${bet.point})`;
      if (sum === bet.point || sum === 7) return "LOSE";
      return "PENDING (no action)";

    default:
      return "UNKNOWN";
  }
}

// ===== TESTS =====

test.describe("API-Based Bet Placement and Resolution", () => {
  test.beforeEach(async ({ page }) => {
    // Just verify the server is running
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
  });

  test("Place and resolve Pass Line bet", async ({ page }) => {
    test.setTimeout(60000);

    console.log("\n=== Testing Pass Line Bet ===");

    // Place bet
    const placeBetResponse = await placeBet(TARGET_URL, [LINE_BETS[0]]);
    console.log("Place bet response:", JSON.stringify(placeBetResponse, null, 2));
    expect(placeBetResponse.success).toBe(true);

    // Settle round
    const settleResponse = await settleRound(TARGET_URL);
    console.log("Settle round response:", JSON.stringify(settleResponse, null, 2));
    expect(settleResponse.success).toBe(true);
    expect(settleResponse.diceResults).toBeDefined();

    // Evaluate outcome
    const outcome = evaluateBetOutcome(LINE_BETS[0], settleResponse.diceResults!);
    console.log(`Dice result: ${settleResponse.diceResults!.die1} + ${settleResponse.diceResults!.die2} = ${settleResponse.diceResults!.sum}`);
    console.log(`Outcome: ${outcome}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/pass-line-result.png` });
  });

  test("Place and resolve Field bet", async ({ page }) => {
    test.setTimeout(60000);

    console.log("\n=== Testing Field Bet ===");

    const fieldBet = PROP_BETS.find(b => b.name === "Field")!;

    // Place bet
    const placeBetResponse = await placeBet(TARGET_URL, [fieldBet]);
    console.log("Place bet response:", JSON.stringify(placeBetResponse, null, 2));
    expect(placeBetResponse.success).toBe(true);

    // Settle round
    const settleResponse = await settleRound(TARGET_URL);
    console.log("Settle round response:", JSON.stringify(settleResponse, null, 2));
    expect(settleResponse.success).toBe(true);

    // Evaluate outcome
    const outcome = evaluateBetOutcome(fieldBet, settleResponse.diceResults!);
    console.log(`Dice result: ${settleResponse.diceResults!.die1} + ${settleResponse.diceResults!.die2} = ${settleResponse.diceResults!.sum}`);
    console.log(`Outcome: ${outcome}`);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/field-result.png` });
  });

  test("Place multiple prop bets and resolve", async ({ page }) => {
    test.setTimeout(120000);

    console.log("\n=== Testing Multiple Prop Bets ===");

    // Place all prop bets
    const placeBetResponse = await placeBet(TARGET_URL, PROP_BETS);
    console.log("Place bets response:", JSON.stringify(placeBetResponse, null, 2));
    expect(placeBetResponse.success).toBe(true);
    expect(placeBetResponse.betsPlaced).toBe(PROP_BETS.length);

    // Settle round
    const settleResponse = await settleRound(TARGET_URL);
    console.log("Settle round response:", JSON.stringify(settleResponse, null, 2));
    expect(settleResponse.success).toBe(true);

    // Evaluate each bet outcome
    console.log(`\nDice result: ${settleResponse.diceResults!.die1} + ${settleResponse.diceResults!.die2} = ${settleResponse.diceResults!.sum}`);
    console.log("\nBet Outcomes:");
    for (const bet of PROP_BETS) {
      const outcome = evaluateBetOutcome(bet, settleResponse.diceResults!);
      console.log(`  ${bet.name}: ${outcome}`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/props-result.png` });
  });

  test("Place hardway bets and resolve", async ({ page }) => {
    test.setTimeout(120000);

    console.log("\n=== Testing Hardway Bets ===");

    // Place all hardway bets
    const placeBetResponse = await placeBet(TARGET_URL, HARDWAY_BETS);
    console.log("Place bets response:", JSON.stringify(placeBetResponse, null, 2));
    expect(placeBetResponse.success).toBe(true);

    // Settle round
    const settleResponse = await settleRound(TARGET_URL);
    console.log("Settle round response:", JSON.stringify(settleResponse, null, 2));
    expect(settleResponse.success).toBe(true);

    // Evaluate each bet outcome
    console.log(`\nDice result: ${settleResponse.diceResults!.die1} + ${settleResponse.diceResults!.die2} = ${settleResponse.diceResults!.sum}`);
    console.log("\nBet Outcomes:");
    for (const bet of HARDWAY_BETS) {
      const outcome = evaluateBetOutcome(bet, settleResponse.diceResults!);
      console.log(`  ${bet.name}: ${outcome}`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/hardways-result.png` });
  });

  test("Place place bets and resolve", async ({ page }) => {
    test.setTimeout(120000);

    console.log("\n=== Testing Place Bets ===");

    // Place all place bets
    const placeBetResponse = await placeBet(TARGET_URL, PLACE_BETS);
    console.log("Place bets response:", JSON.stringify(placeBetResponse, null, 2));
    expect(placeBetResponse.success).toBe(true);

    // Settle round
    const settleResponse = await settleRound(TARGET_URL);
    console.log("Settle round response:", JSON.stringify(settleResponse, null, 2));
    expect(settleResponse.success).toBe(true);

    // Evaluate each bet outcome
    console.log(`\nDice result: ${settleResponse.diceResults!.die1} + ${settleResponse.diceResults!.die2} = ${settleResponse.diceResults!.sum}`);
    console.log("\nBet Outcomes:");
    for (const bet of PLACE_BETS) {
      const outcome = evaluateBetOutcome(bet, settleResponse.diceResults!);
      console.log(`  ${bet.name}: ${outcome}`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/place-bets-result.png` });
  });

  test("Run 5 rounds with random bet selection", async ({ page }) => {
    test.setTimeout(300000);

    console.log("\n=== Running 5 Rounds with Random Bets ===");

    const allBets = [...LINE_BETS, ...PROP_BETS, ...PLACE_BETS, ...HARDWAY_BETS];
    const roundResults: Array<{
      round: number;
      bets: string[];
      diceResult: DiceResult;
      outcomes: string[];
    }> = [];

    for (let round = 1; round <= 5; round++) {
      console.log(`\n--- Round ${round} ---`);

      // Select random bets (2-4 bets per round)
      const numBets = Math.floor(Math.random() * 3) + 2;
      const shuffled = [...allBets].sort(() => Math.random() - 0.5);
      const selectedBets = shuffled.slice(0, numBets);

      console.log(`Selected bets: ${selectedBets.map(b => b.name).join(", ")}`);

      // Place bets
      const placeBetResponse = await placeBet(TARGET_URL, selectedBets);
      if (!placeBetResponse.success) {
        console.log(`Failed to place bets: ${placeBetResponse.error}`);
        continue;
      }
      console.log(`Placed ${placeBetResponse.betsPlaced} bets`);

      // Settle round
      const settleResponse = await settleRound(TARGET_URL);
      if (!settleResponse.success) {
        console.log(`Failed to settle: ${settleResponse.error}`);
        continue;
      }

      const diceResult = settleResponse.diceResults!;
      console.log(`Dice: ${diceResult.die1} + ${diceResult.die2} = ${diceResult.sum}`);

      // Evaluate outcomes
      const outcomes: string[] = [];
      for (const bet of selectedBets) {
        const outcome = evaluateBetOutcome(bet, diceResult);
        outcomes.push(`${bet.name}: ${outcome}`);
        console.log(`  ${bet.name}: ${outcome}`);
      }

      roundResults.push({
        round,
        bets: selectedBets.map(b => b.name),
        diceResult,
        outcomes,
      });

      // Small delay between rounds
      await page.waitForTimeout(500);
    }

    // Summary
    console.log("\n=== Round Summary ===");
    for (const result of roundResults) {
      console.log(`Round ${result.round}: Dice ${result.diceResult.sum}, Bets: ${result.bets.join(", ")}`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/multi-round-final.png` });
    expect(roundResults.length).toBeGreaterThan(0);
  });

  test("Stress test: 10 consecutive rolls", async ({ page }) => {
    test.setTimeout(600000);

    console.log("\n=== Stress Test: 10 Consecutive Rolls ===");

    const rolls: DiceResult[] = [];
    const distribution = new Map<number, number>();

    for (let i = 1; i <= 10; i++) {
      console.log(`\nRoll ${i}...`);

      // Place a simple bet
      const bet = PROP_BETS[0]; // Field bet
      const placeBetResponse = await placeBet(TARGET_URL, [bet]);
      if (!placeBetResponse.success) {
        console.log(`Bet placement failed: ${placeBetResponse.error}`);
        continue;
      }

      // Settle round
      const settleResponse = await settleRound(TARGET_URL);
      if (!settleResponse.success) {
        console.log(`Settle failed: ${settleResponse.error}`);
        continue;
      }

      const diceResult = settleResponse.diceResults!;
      rolls.push(diceResult);

      // Track distribution
      const sum = diceResult.sum;
      distribution.set(sum, (distribution.get(sum) || 0) + 1);

      console.log(`  Result: ${diceResult.die1} + ${diceResult.die2} = ${sum}`);

      // Small delay
      await page.waitForTimeout(200);
    }

    // Print distribution
    console.log("\n=== Roll Distribution ===");
    for (let sum = 2; sum <= 12; sum++) {
      const count = distribution.get(sum) || 0;
      const bar = "█".repeat(count);
      console.log(`${sum.toString().padStart(2)}: ${bar} (${count})`);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/stress-test-final.png` });
    expect(rolls.length).toBe(10);
  });
});
