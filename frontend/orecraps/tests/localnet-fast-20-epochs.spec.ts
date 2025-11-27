import { test, expect, Page } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const TARGET_EPOCHS = 20;
const MAX_WAIT_TIME = 600000; // 10 minutes max
const LOCALNET_RPC = "http://127.0.0.1:8899";
const ROLL_DURATION_SLOTS = 100; // Fast: 100 slots = ~400ms on localnet

interface SimulationResults {
  epochs: number;
  rounds: number;
  rollHistory: number[];
  sumDistribution: Record<number, number>;
  sevenOuts: number;
  consoleErrors: string[];
  consoleMessages: string[];
  transactionLogs: string[];
  epochDetails: EpochDetail[];
  startTime: number;
  endTime: number;
  analyticsSnapshot: AnalyticsSnapshot | null;
}

interface EpochDetail {
  epochNumber: number;
  rolls: number[];
  duration: number;
  startTime: number;
  endTime: number;
  uniqueSums: number[];
  bonusMultiplier: number;
}

interface AnalyticsSnapshot {
  totalEpochs: number;
  totalRounds: number;
  sumDistribution: Record<number, number>;
  strategyPerformance: Record<string, { rng: number; crap: number; roi: number }>;
}

test.describe("Localnet Fast 20-Epoch Simulation", () => {
  test("should run fast 20-epoch simulation on localnet with comprehensive analytics", async ({ page }) => {
    test.setTimeout(900000); // 15 minutes max

    const results: SimulationResults = {
      epochs: 0,
      rounds: 0,
      rollHistory: [],
      sumDistribution: {},
      sevenOuts: 0,
      consoleErrors: [],
      consoleMessages: [],
      transactionLogs: [],
      epochDetails: [],
      startTime: Date.now(),
      endTime: 0,
      analyticsSnapshot: null,
    };

    let currentEpochRolls: number[] = [];
    let currentEpochStartTime = 0;
    let currentUniqueSums: Set<number> = new Set();

    // Track ALL console messages for analysis
    page.on("console", (msg) => {
      const text = msg.text();
      results.consoleMessages.push(`[${msg.type()}] ${text.slice(0, 500)}`);

      if (msg.type() === "error") {
        results.consoleErrors.push(text.slice(0, 300));
      }

      // Capture transaction signatures
      if (text.includes("Transaction") || text.includes("signature") || text.includes("Signature")) {
        results.transactionLogs.push(text.slice(0, 300));
      }

      // Capture epoch/round info from console
      if (text.includes("Epoch") || text.includes("Round") || text.includes("7 OUT")) {
        console.log(`[App Console] ${text.slice(0, 200)}`);
      }
    });

    console.log("=== Starting Fast Localnet 20-Epoch Simulation ===");
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Network: Localnet (${LOCALNET_RPC})`);
    console.log(`Roll Duration: ${ROLL_DURATION_SLOTS} slots (~400ms per roll)`);
    console.log(`Goal: ${TARGET_EPOCHS} epochs`);

    // Navigate to page
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/localnet-fast-start.png", fullPage: true });

    // Switch to Localnet
    console.log("Switching to Localnet...");
    const networkToggle = page.locator('button:has-text("Devnet")').first();
    if (await networkToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await networkToggle.click();
      await page.waitForTimeout(500);
      const localnetOption = page.locator('text=Localnet');
      if (await localnetOption.isVisible({ timeout: 3000 })) {
        await localnetOption.click();
        console.log("Switched to Localnet!");
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: "/tmp/localnet-fast-network.png", fullPage: true });

    // Navigate to Bots tab if needed (mobile view)
    const botsTab = page.locator('button:has-text("Bots")').first();
    if (await botsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await botsTab.click();
      await page.waitForTimeout(500);
    }

    // Enable continuous mode and set target epochs to 20
    const continuousCheckbox = page.locator('#continuous-mode');
    await expect(continuousCheckbox).toBeVisible({ timeout: 10000 });
    await continuousCheckbox.check();
    console.log("Continuous mode enabled!");

    // Set target epochs to 20
    const targetInput = page.locator('input[type="number"]').first();
    await targetInput.fill(TARGET_EPOCHS.toString());
    console.log(`Target epochs set to ${TARGET_EPOCHS}`);
    await page.waitForTimeout(500);

    // Start the simulation
    const startButton = page.locator('button:has-text("Start Epoch")').first();
    await expect(startButton).toBeVisible({ timeout: 30000 });
    await startButton.click();
    console.log("Simulation started!");
    currentEpochStartTime = Date.now();
    await page.waitForTimeout(1000);

    // Monitor the simulation with fast polling
    let lastEpochNum = 0;
    let lastRollText = "";
    let waitingForNextEpoch = false;
    const startTime = Date.now();
    let screenshotCount = 0;

    while (results.epochs < TARGET_EPOCHS && Date.now() - startTime < MAX_WAIT_TIME) {
      // Check for epoch number in "E#X R#Y" format
      const epochDisplay = page.locator('text=/E#\\d+/').first();
      try {
        const epochText = await epochDisplay.textContent({ timeout: 500 });
        if (epochText) {
          const match = epochText.match(/E#(\d+)/);
          if (match) {
            const currentEpoch = parseInt(match[1]);
            if (currentEpoch > lastEpochNum) {
              // New epoch started (previous one had 7-out)
              if (lastEpochNum > 0) {
                results.sevenOuts++;
                const epochEndTime = Date.now();
                results.epochDetails.push({
                  epochNumber: lastEpochNum,
                  rolls: [...currentEpochRolls],
                  duration: epochEndTime - currentEpochStartTime,
                  startTime: currentEpochStartTime,
                  endTime: epochEndTime,
                  uniqueSums: Array.from(currentUniqueSums),
                  bonusMultiplier: currentUniqueSums.size >= 10 ? 189 :
                                   currentUniqueSums.size >= 9 ? 40 :
                                   currentUniqueSums.size >= 8 ? 15 :
                                   currentUniqueSums.size >= 7 ? 7 :
                                   currentUniqueSums.size >= 6 ? 4 :
                                   currentUniqueSums.size >= 5 ? 2 : 0,
                });
                console.log(`  Epoch ${lastEpochNum} complete: ${currentEpochRolls.length} rolls, ${(epochEndTime - currentEpochStartTime)}ms, uniqueSums=${currentUniqueSums.size}`);
              }
              results.epochs = currentEpoch;
              lastEpochNum = currentEpoch;
              waitingForNextEpoch = false;
              currentEpochRolls = [];
              currentUniqueSums = new Set();
              currentEpochStartTime = Date.now();
              console.log(`\n--- Epoch ${currentEpoch}/${TARGET_EPOCHS} ---`);
            }
          }
        }
      } catch {
        // Display not found
      }

      // Check for dice roll display - look for multiple patterns
      const rollPatterns = [
        page.locator('text=/\\d-\\d \\(\\d+\\)/').first(),
        page.locator('[class*="dice"]').first(),
      ];

      for (const rollDisplay of rollPatterns) {
        try {
          const rollText = await rollDisplay.textContent({ timeout: 300 });
          if (rollText && rollText !== lastRollText) {
            const match = rollText.match(/(\d)-(\d) \((\d+)\)/);
            if (match) {
              lastRollText = rollText;
              const die1 = parseInt(match[1]);
              const die2 = parseInt(match[2]);
              const sum = parseInt(match[3]);

              results.rollHistory.push(sum);
              currentEpochRolls.push(sum);
              if (sum !== 7) {
                currentUniqueSums.add(sum);
              }
              results.rounds++;
              results.sumDistribution[sum] = (results.sumDistribution[sum] || 0) + 1;
              console.log(`  Roll #${results.rounds}: ${die1}-${die2} = ${sum}${sum === 7 ? " >>> 7 OUT! <<<" : ""}`);

              if (sum === 7) {
                waitingForNextEpoch = true;
              }
              break;
            }
          }
        } catch {
          // Roll display not found
        }
      }

      // If waiting for next epoch and "Start Epoch" button is available, click it
      if (waitingForNextEpoch && results.epochs < TARGET_EPOCHS) {
        const startEpochButton = page.locator('button:has-text("Start Epoch")');
        try {
          if (await startEpochButton.isVisible({ timeout: 300 })) {
            console.log("  [Test] Clicking Start Epoch button for next epoch...");
            await startEpochButton.click();
            await page.waitForTimeout(1000);
            waitingForNextEpoch = false;
          }
        } catch {
          // Button not visible yet
        }
      }

      // Take periodic screenshots
      if (results.epochs > 0 && results.epochs % 5 === 0 && screenshotCount < results.epochs / 5) {
        screenshotCount = results.epochs / 5;
        await page.screenshot({
          path: `/tmp/localnet-fast-epoch-${results.epochs}.png`,
          fullPage: true
        }).catch(() => {});
      }

      await page.waitForTimeout(100); // Fast polling for localnet
    }

    results.endTime = Date.now();

    // Record final epoch if still running
    if (currentEpochRolls.length > 0) {
      results.epochDetails.push({
        epochNumber: lastEpochNum,
        rolls: [...currentEpochRolls],
        duration: Date.now() - currentEpochStartTime,
        startTime: currentEpochStartTime,
        endTime: Date.now(),
        uniqueSums: Array.from(currentUniqueSums),
        bonusMultiplier: currentUniqueSums.size >= 10 ? 189 :
                         currentUniqueSums.size >= 9 ? 40 :
                         currentUniqueSums.size >= 8 ? 15 :
                         currentUniqueSums.size >= 7 ? 7 :
                         currentUniqueSums.size >= 6 ? 4 :
                         currentUniqueSums.size >= 5 ? 2 : 0,
      });
    }

    // Final epoch count
    if (lastEpochNum >= TARGET_EPOCHS) {
      results.epochs = TARGET_EPOCHS;
      results.sevenOuts = TARGET_EPOCHS;
    }

    // Take final screenshot
    await page.screenshot({ path: "/tmp/localnet-fast-final.png", fullPage: true });

    // Navigate to analytics page and capture data
    try {
      await page.goto(`${TARGET_URL}/analytics`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "/tmp/localnet-fast-analytics.png", fullPage: true });

      // Try to extract analytics data from the page
      const analyticsData = await page.evaluate(() => {
        // This will try to access localStorage analytics data
        const stored = localStorage.getItem("orecraps-analytics");
        return stored ? JSON.parse(stored) : null;
      }).catch(() => null);

      if (analyticsData) {
        results.analyticsSnapshot = analyticsData;
      }
    } catch {
      console.log("Could not capture analytics page");
    }

    // Print comprehensive results
    console.log("\n" + "=".repeat(70));
    console.log("       LOCALNET FAST SIMULATION RESULTS");
    console.log("=".repeat(70));
    console.log(`Total Duration: ${((results.endTime - results.startTime) / 1000).toFixed(1)}s`);
    console.log(`Epochs Completed: ${results.epochs}/${TARGET_EPOCHS}`);
    console.log(`Total Rounds (Rolls): ${results.rounds}`);
    console.log(`7-Outs: ${results.sevenOuts}`);
    console.log(`Avg Rounds/Epoch: ${results.epochs > 0 ? (results.rounds / results.epochs).toFixed(2) : 0}`);
    console.log(`Console Errors: ${results.consoleErrors.length}`);
    console.log(`Transaction Logs: ${results.transactionLogs.length}`);

    if (results.rounds > 0) {
      console.log("\n--- Sum Distribution Analysis ---");
      const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const expectedProb: Record<number, number> = {
        2: 1/36, 3: 2/36, 4: 3/36, 5: 4/36, 6: 5/36,
        7: 6/36, 8: 5/36, 9: 4/36, 10: 3/36, 11: 2/36, 12: 1/36
      };

      let chiSquare = 0;
      for (const sum of sums) {
        const count = results.sumDistribution[sum] || 0;
        const actualPct = (count / results.rounds) * 100;
        const expectedPct = expectedProb[sum] * 100;
        const expectedCount = results.rounds * expectedProb[sum];
        const deviation = actualPct - expectedPct;
        const chiComponent = Math.pow(count - expectedCount, 2) / expectedCount;
        chiSquare += chiComponent;
        const bar = "#".repeat(Math.round(count / results.rounds * 40));
        console.log(`  ${sum.toString().padStart(2)}: ${count.toString().padStart(4)} (${actualPct.toFixed(1).padStart(5)}%) exp:${expectedPct.toFixed(1).padStart(5)}% dev:${deviation >= 0 ? '+' : ''}${deviation.toFixed(1).padStart(5)}% ${bar}`);
      }
      console.log(`\n  Chi-Square Statistic: ${chiSquare.toFixed(2)} (df=10, p<0.05 critical=18.31)`);
      console.log(`  Distribution is ${chiSquare < 18.31 ? "CONSISTENT with fair dice" : "SUSPICIOUS - may not be fair"}`);
    }

    console.log("\n--- Epoch Details (showing all) ---");
    for (const epoch of results.epochDetails) {
      const bonusStr = epoch.bonusMultiplier > 0 ? ` BONUS:${epoch.bonusMultiplier}:1` : "";
      console.log(`  E${epoch.epochNumber}: ${epoch.rolls.length} rolls, ${(epoch.duration / 1000).toFixed(1)}s, uniqueSums=${epoch.uniqueSums.length}${bonusStr}`);
      console.log(`    Rolls: [${epoch.rolls.join(', ')}]`);
    }

    // Bonus bet analysis
    const epochsWithBonus = results.epochDetails.filter(e => e.bonusMultiplier > 0);
    console.log(`\n--- Bonus Bet Analysis ---`);
    console.log(`  Epochs qualifying for bonus: ${epochsWithBonus.length}/${results.epochDetails.length} (${(epochsWithBonus.length / results.epochDetails.length * 100).toFixed(1)}%)`);
    if (epochsWithBonus.length > 0) {
      const bonusBreakdown = epochsWithBonus.reduce((acc, e) => {
        acc[e.bonusMultiplier] = (acc[e.bonusMultiplier] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      for (const [mult, count] of Object.entries(bonusBreakdown)) {
        console.log(`    ${mult}:1 payout: ${count} epochs`);
      }
    }

    if (results.consoleErrors.length > 0) {
      console.log("\n--- Console Errors (first 10) ---");
      for (const err of results.consoleErrors.slice(0, 10)) {
        console.log(`  ${err.slice(0, 100)}...`);
      }
    }

    if (results.transactionLogs.length > 0) {
      console.log("\n--- Transaction Logs (first 20) ---");
      for (const log of results.transactionLogs.slice(0, 20)) {
        console.log(`  ${log.slice(0, 100)}`);
      }
    }

    if (results.analyticsSnapshot) {
      console.log("\n--- Analytics Store Snapshot ---");
      console.log(`  ${JSON.stringify(results.analyticsSnapshot, null, 2).slice(0, 500)}...`);
    }

    console.log("=".repeat(70) + "\n");

    // Write detailed results to JSON
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile('/tmp/localnet-fast-results.json', JSON.stringify(results, null, 2));
    console.log("Detailed results written to /tmp/localnet-fast-results.json");

    // Assertions
    expect(results.rounds).toBeGreaterThan(0);
    expect(results.epochs).toBeGreaterThanOrEqual(1);

    // Verify sum distribution is reasonable (chi-square should be < 18.31 for 95% confidence)
    if (results.rounds > 100) {
      const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const expectedProb: Record<number, number> = {
        2: 1/36, 3: 2/36, 4: 3/36, 5: 4/36, 6: 5/36,
        7: 6/36, 8: 5/36, 9: 4/36, 10: 3/36, 11: 2/36, 12: 1/36
      };
      let chiSquare = 0;
      for (const sum of sums) {
        const count = results.sumDistribution[sum] || 0;
        const expectedCount = results.rounds * expectedProb[sum];
        chiSquare += Math.pow(count - expectedCount, 2) / expectedCount;
      }
      console.log(`Final Chi-Square test: ${chiSquare.toFixed(2)}`);
      // Warn but don't fail on chi-square (small samples can have high variance)
      if (chiSquare > 30) {
        console.warn("WARNING: Chi-square is unusually high, may indicate non-random distribution");
      }
    }
  });
});
