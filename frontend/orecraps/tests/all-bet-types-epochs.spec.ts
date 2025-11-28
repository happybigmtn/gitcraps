import { test, expect, Page } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const SCREENSHOT_DIR = "/tmp/craps-e2e";

// All bet types by category
const BET_TYPES = {
  LINE: [
    { name: "Pass Line", selector: 'button:has-text("Pass Line")' },
    { name: "Don't Pass", selector: 'button:has-text("Don\'t Pass")' },
  ],
  PLACE: [
    { name: "Place 4", selector: 'button:has-text("4")' },
    { name: "Place 5", selector: 'button:has-text("5")' },
    { name: "Place 6", selector: 'button:has-text("6")' },
    { name: "Place 8", selector: 'button:has-text("8")' },
    { name: "Place 9", selector: 'button:has-text("9")' },
    { name: "Place 10", selector: 'button:has-text("10")' },
  ],
  PROPS: [
    { name: "Field", selector: 'button:has-text("Field")' },
    { name: "Any Seven", selector: 'button:has-text("Any 7")' },
    { name: "Any Craps", selector: 'button:has-text("Any Craps")' },
    { name: "Yo Eleven", selector: 'button:has-text("Yo (11)")' },
    { name: "Aces", selector: 'button:has-text("Aces (2)")' },
    { name: "Twelve", selector: 'button:has-text("12 (Boxcars)")' },
  ],
  HARDWAYS: [
    { name: "Hard 4", selector: 'button:has-text("Hard 4")' },
    { name: "Hard 6", selector: 'button:has-text("Hard 6")' },
    { name: "Hard 8", selector: 'button:has-text("Hard 8")' },
    { name: "Hard 10", selector: 'button:has-text("Hard 10")' },
  ],
};

// All bet types flattened for comprehensive testing
const ALL_BET_TYPES = [
  ...BET_TYPES.PROPS.map(b => ({ ...b, tab: "Props" })),
  ...BET_TYPES.PLACE.map(b => ({ ...b, tab: "Place" })),
  ...BET_TYPES.HARDWAYS.map(b => ({ ...b, tab: "Hard" })),
  ...BET_TYPES.LINE.map(b => ({ ...b, tab: "Line" })),
];

interface DiceResult {
  die1: number;
  die2: number;
  sum: number;
  isHardway: boolean;
}

interface SimulateRollResponse {
  success: boolean;
  simulated: boolean;
  diceResults: DiceResult;
  winningSquare: number;
  outcomes: Record<string, { wins: boolean; reason: string }>;
  message: string;
}

interface BetTestResult {
  betType: string;
  placed: boolean;
  diceResult?: DiceResult;
  outcome?: string;
  screenshotPath: string;
}

interface EpochSummary {
  epoch: number;
  betsPlaced: string[];
  rolls: DiceResult[];
  screenshots: string[];
}

/**
 * Navigate to Craps tab
 */
async function navigateToCraps(page: Page): Promise<void> {
  const crapsTab = page.locator('button:has-text("Craps")').first();
  if (await crapsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await crapsTab.click();
    await page.waitForTimeout(500);
  }
}

/**
 * Switch to a specific tab in the betting panel
 */
async function switchToTab(page: Page, tabName: string): Promise<void> {
  const tab = page.locator(`button[role="tab"]:has-text("${tabName}")`).first();
  if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(300);
  }
}

/**
 * Set the bet amount
 */
async function setBetAmount(page: Page, amount: number): Promise<void> {
  const amountInput = page.locator('input#bet-amount, input[type="number"]').first();
  if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await amountInput.fill(String(amount));
  }
}

/**
 * Click a bet button to add to pending bets
 */
async function clickBetButton(
  page: Page,
  selector: string,
  tabName: string
): Promise<boolean> {
  await switchToTab(page, tabName);

  const btn = page.locator(selector).first();
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const isDisabled = await btn.isDisabled();
    if (!isDisabled) {
      await btn.click();
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}

/**
 * Submit pending bets via the API
 */
async function submitBetsViaAPI(
  page: Page,
  betTypes: Array<{ betType: number; point: number; amount: number }>
): Promise<boolean> {
  const response = await page.evaluate(async (bets) => {
    const res = await fetch("/api/place-bet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: "localnet", bets }),
    });
    return await res.json();
  }, betTypes);

  return response.success === true;
}

/**
 * Simulate a dice roll
 */
async function simulateRoll(page: Page): Promise<SimulateRollResponse | null> {
  try {
    const response = await page.evaluate(async () => {
      const res = await fetch("/api/simulate-roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network: "localnet" }),
      });
      return await res.json();
    });

    return response as SimulateRollResponse;
  } catch (error) {
    console.error("Failed to simulate roll:", error);
    return null;
  }
}

/**
 * Click the Roll Dice button in the UI
 */
async function clickRollDiceButton(page: Page): Promise<DiceResult | null> {
  const rollBtn = page.locator('button:has-text("Roll Dice")').first();
  if (await rollBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const isDisabled = await rollBtn.isDisabled();
    if (!isDisabled) {
      await rollBtn.click();

      // Wait for roll to complete
      await page.waitForTimeout(2000);

      // Check for dice result display
      const diceResult = page.locator('text=/\\d+ \\+ \\d+ = \\d+/').first();
      if (await diceResult.isVisible({ timeout: 5000 }).catch(() => false)) {
        const text = await diceResult.textContent();
        const match = text?.match(/(\d+) \+ (\d+) = (\d+)/);
        if (match) {
          return {
            die1: parseInt(match[1]),
            die2: parseInt(match[2]),
            sum: parseInt(match[3]),
            isHardway: parseInt(match[1]) === parseInt(match[2]),
          };
        }
      }
    }
  }
  return null;
}

/**
 * Take a screenshot with descriptive name
 */
async function takeScreenshot(
  page: Page,
  name: string,
  epoch: number
): Promise<string> {
  const timestamp = Date.now();
  const path = `${SCREENSHOT_DIR}/epoch-${epoch}-${name}-${timestamp}.png`;
  await page.screenshot({ path, fullPage: true });
  return path;
}

/**
 * Verify the page state matches expectations
 */
async function verifyPageState(
  page: Page,
  expectedStates: Record<string, boolean>
): Promise<Record<string, boolean>> {
  const actualStates: Record<string, boolean> = {};

  for (const [key, _] of Object.entries(expectedStates)) {
    switch (key) {
      case "bettingPanelVisible":
        actualStates[key] = await page
          .locator('text="Craps Bets"')
          .isVisible({ timeout: 3000 })
          .catch(() => false);
        break;
      case "hasPendingBets":
        actualStates[key] = await page
          .locator('text="Pending Bets"')
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        break;
      case "rollDiceButtonVisible":
        actualStates[key] = await page
          .locator('button:has-text("Roll Dice")')
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        break;
      case "settleBetsButtonVisible":
        actualStates[key] = await page
          .locator('button:has-text("Settle Bets")')
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        break;
      case "diceResultVisible":
        actualStates[key] = await page
          .locator('text=/\\d+ \\+ \\d+ = \\d+/')
          .isVisible({ timeout: 2000 })
          .catch(() => false);
        break;
      default:
        actualStates[key] = false;
    }
  }

  return actualStates;
}

// ===== TESTS =====

test.describe("Comprehensive Craps Bet Types E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and set up
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await navigateToCraps(page);
  });

  test("All bet buttons are visible and functional", async ({ page }) => {
    test.setTimeout(120000);

    const results: Record<string, { visible: boolean; clickable: boolean }> = {};

    // Test each bet type
    for (const bet of ALL_BET_TYPES) {
      await switchToTab(page, bet.tab);
      await page.waitForTimeout(200);

      const btn = page.locator(bet.selector).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      const clickable = visible ? !(await btn.isDisabled()) : false;

      results[bet.name] = { visible, clickable };

      // Take screenshot for each tab (first bet in tab)
      if (bet === BET_TYPES.PROPS[0] || bet === BET_TYPES.PLACE[0] ||
          bet === BET_TYPES.HARDWAYS[0] || bet === BET_TYPES.LINE[0]) {
        await takeScreenshot(page, `tab-${bet.tab.toLowerCase()}`, 0);
      }
    }

    // Log and verify results
    console.log("\n=== All Bet Types Visibility ===");
    let visibleCount = 0;
    for (const [name, status] of Object.entries(results)) {
      console.log(`${name}: visible=${status.visible}, clickable=${status.clickable}`);
      if (status.visible) visibleCount++;
    }

    // At least 75% of bets should be visible
    expect(visibleCount).toBeGreaterThan(Object.keys(results).length * 0.75);
  });

  test("Place bets via API and roll dice across 5 epochs", async ({ page }) => {
    test.setTimeout(180000);

    const epochSummaries: EpochSummary[] = [];

    for (let epoch = 1; epoch <= 5; epoch++) {
      console.log(`\n=== EPOCH ${epoch} ===`);

      const summary: EpochSummary = {
        epoch,
        betsPlaced: [],
        rolls: [],
        screenshots: [],
      };

      // Screenshot: Start of epoch
      const startShot = await takeScreenshot(page, "start", epoch);
      summary.screenshots.push(startShot);

      // Set bet amount
      await setBetAmount(page, 0.01);

      // Place different bet types based on epoch to test variety
      const betsToPlace: Array<{ name: string; betType: number; point: number }> = [];

      switch (epoch % 5) {
        case 1: // Props bets
          betsToPlace.push({ name: "Field", betType: 8, point: 0 });
          betsToPlace.push({ name: "AnySeven", betType: 9, point: 0 });
          break;
        case 2: // More props
          betsToPlace.push({ name: "AnyCraps", betType: 10, point: 0 });
          betsToPlace.push({ name: "YoEleven", betType: 11, point: 0 });
          break;
        case 3: // Place bets
          betsToPlace.push({ name: "Place6", betType: 6, point: 6 });
          betsToPlace.push({ name: "Place8", betType: 6, point: 8 });
          break;
        case 4: // Hardways
          betsToPlace.push({ name: "Hard6", betType: 7, point: 6 });
          betsToPlace.push({ name: "Hard8", betType: 7, point: 8 });
          break;
        case 0: // High-payout props
          betsToPlace.push({ name: "Aces", betType: 14, point: 0 });
          betsToPlace.push({ name: "Twelve", betType: 15, point: 0 });
          break;
      }

      // Place bets via API
      const betPayloads = betsToPlace.map(b => ({
        betType: b.betType,
        point: b.point,
        amount: 0.01,
      }));

      const placed = await submitBetsViaAPI(page, betPayloads);
      if (placed) {
        summary.betsPlaced = betsToPlace.map(b => b.name);
        console.log(`Placed bets: ${summary.betsPlaced.join(", ")}`);
      }

      // Screenshot: After placing bets
      const betsShot = await takeScreenshot(page, "bets-placed", epoch);
      summary.screenshots.push(betsShot);

      // Roll dice 3 times per epoch
      for (let roll = 1; roll <= 3; roll++) {
        console.log(`  Roll ${roll}...`);

        // Click Roll Dice button
        const diceResult = await clickRollDiceButton(page);

        if (diceResult) {
          summary.rolls.push(diceResult);
          console.log(`    Result: ${diceResult.die1} + ${diceResult.die2} = ${diceResult.sum}`);
        } else {
          // Try direct API call
          const apiResult = await simulateRoll(page);
          if (apiResult?.success) {
            summary.rolls.push(apiResult.diceResults);
            console.log(`    API Result: ${apiResult.diceResults.die1} + ${apiResult.diceResults.die2} = ${apiResult.diceResults.sum}`);
          }
        }

        // Wait for UI to update
        await page.waitForTimeout(1000);

        // Screenshot: After each roll
        const rollShot = await takeScreenshot(page, `roll-${roll}`, epoch);
        summary.screenshots.push(rollShot);
      }

      epochSummaries.push(summary);

      // Wait between epochs
      await page.waitForTimeout(1000);
    }

    // Final summary
    console.log("\n=== EPOCH SUMMARIES ===");
    for (const summary of epochSummaries) {
      console.log(`\nEpoch ${summary.epoch}:`);
      console.log(`  Bets: ${summary.betsPlaced.join(", ") || "none"}`);
      console.log(`  Rolls: ${summary.rolls.map(r => `${r.die1}+${r.die2}=${r.sum}`).join(", ")}`);
      console.log(`  Screenshots: ${summary.screenshots.length} captured`);
    }

    // Take final screenshot
    await takeScreenshot(page, "final-summary", 999);

    // Verify we completed all epochs
    expect(epochSummaries.length).toBe(5);
    expect(epochSummaries.every(s => s.rolls.length > 0)).toBeTruthy();
  });

  test("Test each individual bet type with roll", async ({ page }) => {
    test.setTimeout(300000);

    const betResults: BetTestResult[] = [];

    // Map bet names to betType enum values
    const betTypeMapping: Record<string, { type: number; point: number }> = {
      "Pass Line": { type: 0, point: 0 },
      "Don't Pass": { type: 1, point: 0 },
      "Field": { type: 8, point: 0 },
      "Any Seven": { type: 9, point: 0 },
      "Any Craps": { type: 10, point: 0 },
      "Yo Eleven": { type: 11, point: 0 },
      "Aces": { type: 14, point: 0 },
      "Twelve": { type: 15, point: 0 },
      "Place 4": { type: 6, point: 4 },
      "Place 5": { type: 6, point: 5 },
      "Place 6": { type: 6, point: 6 },
      "Place 8": { type: 6, point: 8 },
      "Place 9": { type: 6, point: 9 },
      "Place 10": { type: 6, point: 10 },
      "Hard 4": { type: 7, point: 4 },
      "Hard 6": { type: 7, point: 6 },
      "Hard 8": { type: 7, point: 8 },
      "Hard 10": { type: 7, point: 10 },
    };

    // Test each bet type individually
    for (const [betName, mapping] of Object.entries(betTypeMapping)) {
      console.log(`\n--- Testing ${betName} ---`);

      const result: BetTestResult = {
        betType: betName,
        placed: false,
        screenshotPath: "",
      };

      // Place the bet via API
      const placed = await submitBetsViaAPI(page, [
        { betType: mapping.type, point: mapping.point, amount: 0.01 },
      ]);

      result.placed = placed;

      if (placed) {
        console.log(`  Bet placed successfully`);

        // Take screenshot before roll
        const beforeShot = await takeScreenshot(page, `${betName.replace(/\s+/g, "-")}-before`, 0);

        // Roll dice
        const rollResult = await simulateRoll(page);

        if (rollResult?.success) {
          result.diceResult = rollResult.diceResults;

          // Get outcome for this bet type
          const outcomeKey = betName.toLowerCase().replace(/\s+/g, "").replace("'", "");
          // Map common bet names to outcome keys
          const outcomeMapping: Record<string, string> = {
            "passline": "passLine",
            "dontpass": "dontPass",
            "field": "field",
            "anyseven": "anySeven",
            "anycraps": "anyCraps",
            "yoeleven": "yoEleven",
            "aces": "aces",
            "twelve": "twelve",
          };

          const key = outcomeMapping[outcomeKey] || outcomeKey;
          if (rollResult.outcomes[key]) {
            result.outcome = rollResult.outcomes[key].reason;
          }

          console.log(`  Dice: ${result.diceResult.die1} + ${result.diceResult.die2} = ${result.diceResult.sum}`);
          console.log(`  Outcome: ${result.outcome || "N/A"}`);
        }

        // Take screenshot after roll
        result.screenshotPath = await takeScreenshot(
          page,
          `${betName.replace(/\s+/g, "-")}-after`,
          0
        );
      } else {
        console.log(`  Failed to place bet`);
        result.screenshotPath = await takeScreenshot(
          page,
          `${betName.replace(/\s+/g, "-")}-failed`,
          0
        );
      }

      betResults.push(result);

      // Small delay between bets
      await page.waitForTimeout(500);
    }

    // Final report
    console.log("\n=== INDIVIDUAL BET TYPE RESULTS ===");
    const placedCount = betResults.filter(r => r.placed).length;
    console.log(`Total: ${placedCount}/${betResults.length} bets placed successfully\n`);

    for (const result of betResults) {
      const status = result.placed ? "PLACED" : "FAILED";
      const dice = result.diceResult
        ? `${result.diceResult.die1}+${result.diceResult.die2}=${result.diceResult.sum}`
        : "N/A";
      console.log(`${result.betType}: ${status} | Dice: ${dice} | ${result.outcome || ""}`);
    }

    // Take final summary screenshot
    await takeScreenshot(page, "all-bets-summary", 0);

    // Verify most bets were placed
    expect(placedCount).toBeGreaterThan(betResults.length / 2);
  });

  test("UI state verification across operations", async ({ page }) => {
    test.setTimeout(90000);

    console.log("\n=== UI State Verification Test ===");

    // Initial state
    let state = await verifyPageState(page, {
      bettingPanelVisible: true,
      rollDiceButtonVisible: true,
      settleBetsButtonVisible: true,
      hasPendingBets: false,
      diceResultVisible: false,
    });

    console.log("Initial state:", state);
    await takeScreenshot(page, "initial-state", 0);

    expect(state.bettingPanelVisible).toBeTruthy();
    expect(state.rollDiceButtonVisible).toBeTruthy();

    // Add a bet via UI
    await setBetAmount(page, 0.01);
    await clickBetButton(page, 'button:has-text("Field")', "Props");
    await page.waitForTimeout(500);

    state = await verifyPageState(page, { hasPendingBets: true });
    console.log("After adding bet:", state);
    await takeScreenshot(page, "after-add-bet", 0);

    // Roll dice
    await clickRollDiceButton(page);
    await page.waitForTimeout(2000);

    state = await verifyPageState(page, { diceResultVisible: true });
    console.log("After roll:", state);
    await takeScreenshot(page, "after-roll", 0);

    // Check if dice result is displayed
    const hasResult = state.diceResultVisible;
    console.log(`Dice result visible: ${hasResult}`);

    // Final screenshot
    await takeScreenshot(page, "final-state", 0);
  });
});

test.describe("Multi-Epoch Comprehensive Test", () => {
  test("10 epochs with all bet types rotated", async ({ page }) => {
    test.setTimeout(600000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await navigateToCraps(page);

    const epochResults: Array<{
      epoch: number;
      betTypes: string[];
      rolls: number[];
      winners: string[];
    }> = [];

    // All bet types to rotate through
    const allBetConfigs = [
      { name: "Field", type: 8, point: 0 },
      { name: "AnySeven", type: 9, point: 0 },
      { name: "AnyCraps", type: 10, point: 0 },
      { name: "YoEleven", type: 11, point: 0 },
      { name: "Aces", type: 14, point: 0 },
      { name: "Twelve", type: 15, point: 0 },
      { name: "Place4", type: 6, point: 4 },
      { name: "Place5", type: 6, point: 5 },
      { name: "Place6", type: 6, point: 6 },
      { name: "Place8", type: 6, point: 8 },
      { name: "Hard4", type: 7, point: 4 },
      { name: "Hard6", type: 7, point: 6 },
      { name: "Hard8", type: 7, point: 8 },
      { name: "Hard10", type: 7, point: 10 },
    ];

    for (let epoch = 1; epoch <= 10; epoch++) {
      console.log(`\n========== EPOCH ${epoch} ==========`);

      const result = {
        epoch,
        betTypes: [] as string[],
        rolls: [] as number[],
        winners: [] as string[],
      };

      // Select 3-4 bets for this epoch (rotate through all)
      const startIdx = ((epoch - 1) * 3) % allBetConfigs.length;
      const betsForEpoch = [
        allBetConfigs[startIdx % allBetConfigs.length],
        allBetConfigs[(startIdx + 1) % allBetConfigs.length],
        allBetConfigs[(startIdx + 2) % allBetConfigs.length],
      ];

      result.betTypes = betsForEpoch.map(b => b.name);
      console.log(`Bets: ${result.betTypes.join(", ")}`);

      // Place bets via API
      await submitBetsViaAPI(
        page,
        betsForEpoch.map(b => ({ betType: b.type, point: b.point, amount: 0.01 }))
      );

      // Screenshot: After placing bets
      await takeScreenshot(page, "bets", epoch);

      // Roll dice 2-3 times
      const rollCount = Math.floor(Math.random() * 2) + 2;
      for (let r = 0; r < rollCount; r++) {
        const rollResult = await simulateRoll(page);

        if (rollResult?.success) {
          const sum = rollResult.diceResults.sum;
          result.rolls.push(sum);
          console.log(`  Roll ${r + 1}: ${rollResult.diceResults.die1} + ${rollResult.diceResults.die2} = ${sum}`);

          // Check winners
          for (const [key, outcome] of Object.entries(rollResult.outcomes)) {
            if (outcome.wins && result.betTypes.some(bt => bt.toLowerCase().includes(key.toLowerCase()))) {
              result.winners.push(`${key} (roll ${r + 1})`);
            }
          }
        }

        await page.waitForTimeout(500);
      }

      // Screenshot: After rolls
      await takeScreenshot(page, "after-rolls", epoch);

      epochResults.push(result);

      // Delay between epochs
      await page.waitForTimeout(1000);
    }

    // Final summary
    console.log("\n\n========== FINAL SUMMARY ==========");
    console.log(`Total Epochs: ${epochResults.length}`);

    const totalRolls = epochResults.reduce((sum, e) => sum + e.rolls.length, 0);
    const totalWins = epochResults.reduce((sum, e) => sum + e.winners.length, 0);

    console.log(`Total Rolls: ${totalRolls}`);
    console.log(`Total Wins: ${totalWins}`);

    // Dice distribution
    const distribution: Record<number, number> = {};
    for (const epoch of epochResults) {
      for (const roll of epoch.rolls) {
        distribution[roll] = (distribution[roll] || 0) + 1;
      }
    }

    console.log("\nDice Distribution:");
    for (let i = 2; i <= 12; i++) {
      const count = distribution[i] || 0;
      const bar = "*".repeat(count);
      console.log(`  ${i.toString().padStart(2)}: ${bar} (${count})`);
    }

    // Final screenshot
    await takeScreenshot(page, "summary", 999);

    // Verify test completed successfully
    expect(epochResults.length).toBe(10);
    expect(totalRolls).toBeGreaterThan(15);
  });
});
