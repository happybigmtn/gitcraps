import { test, expect, Page } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const TARGET_EPOCHS = 10;
const MAX_WAIT_TIME = 300000; // 5 minutes max

interface DebugResults {
  epochs: number;
  rounds: number;
  rollHistory: number[];
  sumDistribution: Record<number, number>;
  sevenOuts: number;
  consoleErrors: string[];
  consoleWarnings: string[];
  consoleMessages: string[];
  networkRequests: RequestLog[];
  storeSnapshots: StoreSnapshot[];
  uiStates: UIState[];
  bugs: BugReport[];
  startTime: number;
  endTime: number;
}

interface RequestLog {
  url: string;
  method: string;
  status?: number;
  timestamp: number;
  duration?: number;
}

interface StoreSnapshot {
  timestamp: number;
  epoch: number;
  round: number;
  simulationState: any;
  analyticsState: any;
}

interface UIState {
  timestamp: number;
  epochText: string | null;
  roundText: string | null;
  botLeaderboardVisible: boolean;
  analyticsVisible: boolean;
  startButtonEnabled: boolean;
  continuousModeChecked: boolean;
}

interface BugReport {
  type: string;
  description: string;
  timestamp: number;
  context: any;
}

test.describe("Debug 10-Epoch Simulation", () => {
  test("comprehensive debug simulation with bug detection", async ({ page }) => {
    test.setTimeout(600000); // 10 minutes max

    const results: DebugResults = {
      epochs: 0,
      rounds: 0,
      rollHistory: [],
      sumDistribution: {},
      sevenOuts: 0,
      consoleErrors: [],
      consoleWarnings: [],
      consoleMessages: [],
      networkRequests: [],
      storeSnapshots: [],
      uiStates: [],
      bugs: [],
      startTime: Date.now(),
      endTime: 0,
    };

    // Track ALL console messages
    page.on("console", (msg) => {
      const text = msg.text();
      const entry = `[${msg.type()}] ${text}`;
      results.consoleMessages.push(entry.slice(0, 1000));

      if (msg.type() === "error") {
        results.consoleErrors.push(text);
        results.bugs.push({
          type: "CONSOLE_ERROR",
          description: text.slice(0, 200),
          timestamp: Date.now(),
          context: { type: msg.type() },
        });
      }
      if (msg.type() === "warning") {
        results.consoleWarnings.push(text);
      }
    });

    // Track network requests
    page.on("request", (request) => {
      results.networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      });
    });

    page.on("response", (response) => {
      const req = results.networkRequests.find(
        (r) => r.url === response.url() && !r.status
      );
      if (req) {
        req.status = response.status();
        req.duration = Date.now() - req.timestamp;
        if (response.status() >= 400) {
          results.bugs.push({
            type: "HTTP_ERROR",
            description: `${response.status()} on ${response.url()}`,
            timestamp: Date.now(),
            context: { status: response.status(), url: response.url() },
          });
        }
      }
    });

    console.log("=".repeat(70));
    console.log("  DEBUG 10-EPOCH SIMULATION - BUG DETECTION MODE");
    console.log("=".repeat(70));
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Goal: ${TARGET_EPOCHS} epochs with comprehensive logging`);
    console.log("");

    // Navigate to page
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/debug-start.png", fullPage: true });
    console.log("[DEBUG] Initial page loaded");

    // Switch to Localnet
    console.log("[DEBUG] Switching to Localnet...");
    const networkToggle = page.locator('button:has-text("Devnet")').first();
    if (await networkToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await networkToggle.click();
      await page.waitForTimeout(500);
      const localnetOption = page.locator('text=Localnet');
      if (await localnetOption.isVisible({ timeout: 3000 })) {
        await localnetOption.click();
        console.log("[DEBUG] Switched to Localnet!");
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: "/tmp/debug-network.png", fullPage: true });

    // Check initial store state
    const initialStoreState = await captureStoreState(page);
    results.storeSnapshots.push({
      timestamp: Date.now(),
      epoch: 0,
      round: 0,
      ...initialStoreState,
    });
    console.log("[DEBUG] Initial store state captured");
    console.log(`  - Simulation store: ${JSON.stringify(initialStoreState.simulationState).slice(0, 200)}`);

    // Enable continuous mode
    const continuousCheckbox = page.locator('#continuous-mode');
    await expect(continuousCheckbox).toBeVisible({ timeout: 10000 });
    await continuousCheckbox.check();
    console.log("[DEBUG] Continuous mode enabled");

    // Set target epochs
    const targetInput = page.locator('input[type="number"]').first();
    await targetInput.fill(TARGET_EPOCHS.toString());
    console.log(`[DEBUG] Target epochs set to ${TARGET_EPOCHS}`);
    await page.waitForTimeout(500);

    // Capture UI state before starting
    const uiStateBefore = await captureUIState(page);
    results.uiStates.push(uiStateBefore);
    console.log(`[DEBUG] UI state before start: startButton=${uiStateBefore.startButtonEnabled}, continuous=${uiStateBefore.continuousModeChecked}`);

    // Start the simulation
    const startButton = page.locator('button:has-text("Start Epoch")').first();
    await expect(startButton).toBeVisible({ timeout: 30000 });

    console.log("[DEBUG] Clicking Start Epoch...");
    await startButton.click();
    await page.waitForTimeout(1500);

    // Monitor the simulation
    let lastEpochNum = 0;
    let lastRollText = "";
    let waitingForNextEpoch = false;
    const startTime = Date.now();
    let lastStoreCapture = 0;
    let staleStateCount = 0;
    let lastEpochChange = Date.now();

    console.log("[DEBUG] Entering simulation monitoring loop...\n");

    while (results.epochs < TARGET_EPOCHS && Date.now() - startTime < MAX_WAIT_TIME) {
      // Periodic store state capture (every 5 seconds)
      if (Date.now() - lastStoreCapture > 5000) {
        const storeState = await captureStoreState(page);
        results.storeSnapshots.push({
          timestamp: Date.now(),
          epoch: results.epochs,
          round: results.rounds,
          ...storeState,
        });
        lastStoreCapture = Date.now();

        // Check for stale state (no progress in 30 seconds)
        if (Date.now() - lastEpochChange > 30000) {
          staleStateCount++;
          if (staleStateCount === 1) {
            results.bugs.push({
              type: "STALE_STATE",
              description: `No epoch progress for 30+ seconds at epoch ${results.epochs}`,
              timestamp: Date.now(),
              context: { epoch: results.epochs, round: results.rounds },
            });
            console.log(`[BUG] Stale state detected - no progress for 30s at epoch ${results.epochs}`);
            await page.screenshot({ path: `/tmp/debug-stale-${results.epochs}.png`, fullPage: true });
          }
        }
      }

      // Check for epoch number in "E#X R#Y" format
      const epochDisplay = page.locator('text=/E#\\d+/').first();
      try {
        const epochText = await epochDisplay.textContent({ timeout: 500 });
        if (epochText) {
          const match = epochText.match(/E#(\d+)/);
          if (match) {
            const currentEpoch = parseInt(match[1]);
            if (currentEpoch > lastEpochNum) {
              // New epoch
              if (lastEpochNum > 0) {
                results.sevenOuts++;
                console.log(`[DEBUG] Epoch ${lastEpochNum} complete (7-OUT)`);
              }
              results.epochs = currentEpoch;
              lastEpochNum = currentEpoch;
              lastEpochChange = Date.now();
              staleStateCount = 0;
              waitingForNextEpoch = false;
              console.log(`\n--- EPOCH ${currentEpoch}/${TARGET_EPOCHS} STARTED ---`);

              // Capture store state on epoch change
              const epochStoreState = await captureStoreState(page);
              results.storeSnapshots.push({
                timestamp: Date.now(),
                epoch: currentEpoch,
                round: results.rounds,
                ...epochStoreState,
              });
            }
          }
        }
      } catch {
        // Display not found
      }

      // Check for dice roll display
      const rollDisplay = page.locator('text=/\\d-\\d \\(\\d+\\)/').first();
      try {
        const rollText = await rollDisplay.textContent({ timeout: 300 });
        if (rollText && rollText !== lastRollText) {
          const match = rollText.match(/(\d)-(\d) \((\d+)\)/);
          if (match) {
            lastRollText = rollText;
            const die1 = parseInt(match[1]);
            const die2 = parseInt(match[2]);
            const sum = parseInt(match[3]);

            // Validate dice math
            if (die1 + die2 !== sum) {
              results.bugs.push({
                type: "DICE_MATH_ERROR",
                description: `${die1} + ${die2} should equal ${die1 + die2}, not ${sum}`,
                timestamp: Date.now(),
                context: { die1, die2, displayedSum: sum },
              });
              console.log(`[BUG] Dice math error: ${die1}+${die2}=${die1+die2}, displayed ${sum}`);
            }

            // Validate dice range
            if (die1 < 1 || die1 > 6 || die2 < 1 || die2 > 6) {
              results.bugs.push({
                type: "DICE_RANGE_ERROR",
                description: `Invalid dice values: ${die1}-${die2}`,
                timestamp: Date.now(),
                context: { die1, die2 },
              });
              console.log(`[BUG] Invalid dice values: ${die1}-${die2}`);
            }

            results.rollHistory.push(sum);
            results.rounds++;
            results.sumDistribution[sum] = (results.sumDistribution[sum] || 0) + 1;
            console.log(`  Roll #${results.rounds}: ${die1}-${die2} = ${sum}${sum === 7 ? " >>> 7 OUT! <<<" : ""}`);

            if (sum === 7) {
              waitingForNextEpoch = true;
            }
          }
        }
      } catch {
        // Roll display not found
      }

      // If waiting for next epoch and "Start Epoch" button is available, click it
      if (waitingForNextEpoch && results.epochs < TARGET_EPOCHS) {
        const startEpochButton = page.locator('button:has-text("Start Epoch")');
        try {
          if (await startEpochButton.isVisible({ timeout: 300 })) {
            console.log("  [DEBUG] Clicking Start Epoch for next epoch...");
            await startEpochButton.click();
            await page.waitForTimeout(1000);
            waitingForNextEpoch = false;
          }
        } catch {
          // Button not visible yet
        }
      }

      // Take periodic screenshots
      if (results.epochs > 0 && results.epochs % 3 === 0) {
        await page.screenshot({
          path: `/tmp/debug-epoch-${results.epochs}.png`,
          fullPage: true
        }).catch(() => {});
      }

      await page.waitForTimeout(150);
    }

    results.endTime = Date.now();

    // Final screenshots
    await page.screenshot({ path: "/tmp/debug-final.png", fullPage: true });

    // Final store state
    const finalStoreState = await captureStoreState(page);
    results.storeSnapshots.push({
      timestamp: Date.now(),
      epoch: results.epochs,
      round: results.rounds,
      ...finalStoreState,
    });

    // Check analytics page
    try {
      await page.goto(`${TARGET_URL}/analytics`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "/tmp/debug-analytics.png", fullPage: true });
    } catch {
      console.log("[DEBUG] Could not load analytics page");
    }

    // Print comprehensive results
    console.log("\n" + "=".repeat(70));
    console.log("       DEBUG SIMULATION RESULTS");
    console.log("=".repeat(70));
    console.log(`Duration: ${((results.endTime - results.startTime) / 1000).toFixed(1)}s`);
    console.log(`Epochs: ${results.epochs}/${TARGET_EPOCHS}`);
    console.log(`Rounds: ${results.rounds}`);
    console.log(`7-Outs: ${results.sevenOuts}`);
    console.log(`Avg Rounds/Epoch: ${results.epochs > 0 ? (results.rounds / results.epochs).toFixed(2) : 0}`);

    // Sum distribution
    if (results.rounds > 0) {
      console.log("\n--- Sum Distribution ---");
      const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      for (const sum of sums) {
        const count = results.sumDistribution[sum] || 0;
        const pct = ((count / results.rounds) * 100).toFixed(1);
        console.log(`  ${sum.toString().padStart(2)}: ${count.toString().padStart(4)} (${pct}%)`);
      }
    }

    // Bug report
    console.log("\n--- BUG REPORT ---");
    console.log(`Total Bugs Detected: ${results.bugs.length}`);
    if (results.bugs.length > 0) {
      const bugTypes = results.bugs.reduce((acc, bug) => {
        acc[bug.type] = (acc[bug.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      for (const [type, count] of Object.entries(bugTypes)) {
        console.log(`  ${type}: ${count}`);
      }

      console.log("\nDetailed Bug List:");
      for (const bug of results.bugs) {
        console.log(`  [${bug.type}] ${bug.description}`);
      }
    } else {
      console.log("  No bugs detected!");
    }

    // Console errors
    console.log("\n--- Console Errors ---");
    console.log(`Total: ${results.consoleErrors.length}`);
    for (const err of results.consoleErrors.slice(0, 10)) {
      console.log(`  ${err.slice(0, 150)}`);
    }

    // Store state analysis
    console.log("\n--- Store State Analysis ---");
    console.log(`Snapshots captured: ${results.storeSnapshots.length}`);
    if (results.storeSnapshots.length > 0) {
      const lastSnapshot = results.storeSnapshots[results.storeSnapshots.length - 1];
      console.log(`Final state: epoch=${lastSnapshot.epoch}, round=${lastSnapshot.round}`);
      if (lastSnapshot.simulationState) {
        console.log(`  Simulation: ${JSON.stringify(lastSnapshot.simulationState).slice(0, 300)}`);
      }
      if (lastSnapshot.analyticsState) {
        console.log(`  Analytics: ${JSON.stringify(lastSnapshot.analyticsState).slice(0, 300)}`);
      }
    }

    console.log("=".repeat(70) + "\n");

    // Write detailed results to JSON
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile('/tmp/debug-results.json', JSON.stringify(results, null, 2));
    console.log("Detailed results written to /tmp/debug-results.json");

    // Assertions
    expect(results.rounds).toBeGreaterThan(0);
    expect(results.epochs).toBeGreaterThanOrEqual(1);

    // Bug assertions - fail if critical bugs found
    const criticalBugs = results.bugs.filter(b =>
      b.type === "DICE_MATH_ERROR" ||
      b.type === "DICE_RANGE_ERROR"
    );
    expect(criticalBugs.length).toBe(0);
  });
});

async function captureStoreState(page: Page) {
  try {
    return await page.evaluate(() => {
      const simStore = localStorage.getItem("orecraps-simulation");
      const analyticsStore = localStorage.getItem("orecraps-analytics");
      return {
        simulationState: simStore ? JSON.parse(simStore) : null,
        analyticsState: analyticsStore ? JSON.parse(analyticsStore) : null,
      };
    });
  } catch {
    return { simulationState: null, analyticsState: null };
  }
}

async function captureUIState(page: Page): Promise<UIState> {
  const state: UIState = {
    timestamp: Date.now(),
    epochText: null,
    roundText: null,
    botLeaderboardVisible: false,
    analyticsVisible: false,
    startButtonEnabled: false,
    continuousModeChecked: false,
  };

  try {
    state.epochText = await page.locator('text=/E#\\d+/').first().textContent({ timeout: 500 }).catch(() => null);
    state.botLeaderboardVisible = await page.locator('text="Bot Leaderboard"').isVisible({ timeout: 500 }).catch(() => false);
    state.analyticsVisible = await page.locator('text="Live Analytics"').isVisible({ timeout: 500 }).catch(() => false);
    state.startButtonEnabled = await page.locator('button:has-text("Start Epoch")').isEnabled({ timeout: 500 }).catch(() => false);
    state.continuousModeChecked = await page.locator('#continuous-mode').isChecked().catch(() => false);
  } catch {
    // Ignore capture errors
  }

  return state;
}
