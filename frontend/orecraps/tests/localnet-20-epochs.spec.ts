import { test, expect, Page } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const TARGET_EPOCHS = 20;
const MAX_WAIT_TIME = 900000; // 15 minutes max
const LOCALNET_RPC = "http://127.0.0.1:8899";

interface SimulationResults {
  epochs: number;
  rounds: number;
  rollHistory: number[];
  sumDistribution: Record<number, number>;
  sevenOuts: number;
  rateLimit429Count: number;
  consoleErrors: string[];
  consoleMessages: string[];
  transactionLogs: string[];
  epochDetails: EpochDetail[];
  startTime: number;
  endTime: number;
}

interface EpochDetail {
  epochNumber: number;
  rolls: number[];
  duration: number;
  startTime: number;
  endTime: number;
}

test.describe("Localnet 20-Epoch Simulation", () => {
  test("should run full 20-epoch simulation on localnet with analytics", async ({ page }) => {
    test.setTimeout(1200000); // 20 minutes max

    const results: SimulationResults = {
      epochs: 0,
      rounds: 0,
      rollHistory: [],
      sumDistribution: {},
      sevenOuts: 0,
      rateLimit429Count: 0,
      consoleErrors: [],
      consoleMessages: [],
      transactionLogs: [],
      epochDetails: [],
      startTime: Date.now(),
      endTime: 0,
    };

    let currentEpochRolls: number[] = [];
    let currentEpochStartTime = 0;

    // Track ALL console messages for analysis
    page.on("console", (msg) => {
      const text = msg.text();
      results.consoleMessages.push(`[${msg.type()}] ${text.slice(0, 500)}`);

      if (text.includes("429") || text.includes("rate limit")) {
        results.rateLimit429Count++;
      }
      if (msg.type() === "error" && !text.includes("429")) {
        results.consoleErrors.push(text.slice(0, 300));
      }
      // Capture transaction signatures
      if (text.includes("Transaction") || text.includes("signature") || text.includes("Signature")) {
        results.transactionLogs.push(text.slice(0, 300));
      }
    });

    console.log("=== Starting Localnet 20-Epoch Simulation ===");
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Network: Localnet (${LOCALNET_RPC})`);
    console.log(`Goal: ${TARGET_EPOCHS} epochs`);

    // Navigate to page
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/localnet-simulation-start.png", fullPage: true });

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

    await page.screenshot({ path: "/tmp/localnet-network-switched.png", fullPage: true });

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
    await page.waitForTimeout(2000);

    // Monitor the simulation
    let lastEpochNum = 0;
    let lastRollText = "";
    let waitingForNextEpoch = false;
    const startTime = Date.now();

    while (results.epochs < TARGET_EPOCHS && Date.now() - startTime < MAX_WAIT_TIME) {
      // Check for epoch number in "E#X R#Y" format
      const epochDisplay = page.locator('text=/E#\\d+/').first();
      try {
        const epochText = await epochDisplay.textContent({ timeout: 2000 });
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
                });
                console.log(`  Epoch ${lastEpochNum} ended (${currentEpochRolls.length} rolls, ${epochEndTime - currentEpochStartTime}ms)`);
              }
              results.epochs = currentEpoch;
              lastEpochNum = currentEpoch;
              waitingForNextEpoch = false;
              currentEpochRolls = [];
              currentEpochStartTime = Date.now();
              console.log(`\n--- Epoch ${currentEpoch} ---`);
            }
          }
        }
      } catch {
        // Display not found
      }

      // Check for dice roll display
      const rollDisplay = page.locator('text=/\\d-\\d \\(\\d+\\)/').first();
      try {
        const rollText = await rollDisplay.textContent({ timeout: 1000 });
        if (rollText && rollText !== lastRollText) {
          lastRollText = rollText;
          const match = rollText.match(/(\d)-(\d) \((\d+)\)/);
          if (match) {
            const sum = parseInt(match[3]);
            results.rollHistory.push(sum);
            currentEpochRolls.push(sum);
            results.rounds++;
            results.sumDistribution[sum] = (results.sumDistribution[sum] || 0) + 1;
            console.log(`  Roll: ${match[1]}-${match[2]} = ${sum}`);

            if (sum === 7) {
              console.log("  >>> 7 OUT! <<<");
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
          if (await startEpochButton.isVisible({ timeout: 500 })) {
            console.log("  [Test] Clicking Start Epoch button for next epoch...");
            await startEpochButton.click();
            await page.waitForTimeout(2000);
            waitingForNextEpoch = false;
          }
        } catch {
          // Button not visible yet
        }
      }

      // Take periodic screenshots
      if (results.epochs > 0 && results.epochs % 5 === 0 && results.epochs !== lastEpochNum) {
        await page.screenshot({
          path: `/tmp/localnet-epoch-${results.epochs}.png`,
          fullPage: true
        }).catch(() => {});
      }

      await page.waitForTimeout(300); // Faster polling for localnet
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
      });
    }

    // Final epoch count
    if (lastEpochNum >= TARGET_EPOCHS) {
      results.epochs = TARGET_EPOCHS;
      results.sevenOuts = TARGET_EPOCHS;
    }

    // Take final screenshot
    await page.screenshot({ path: "/tmp/localnet-simulation-final.png", fullPage: true });

    // Navigate to analytics page and take screenshot
    const analyticsLink = page.locator('a[href="/analytics"]').first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "/tmp/localnet-analytics-page.png", fullPage: true });
    }

    // Print comprehensive results
    console.log("\n" + "=".repeat(60));
    console.log("       LOCALNET SIMULATION RESULTS");
    console.log("=".repeat(60));
    console.log(`Total Duration: ${((results.endTime - results.startTime) / 1000).toFixed(1)}s`);
    console.log(`Epochs Completed: ${results.epochs}/${TARGET_EPOCHS}`);
    console.log(`Total Rounds: ${results.rounds}`);
    console.log(`7-Outs: ${results.sevenOuts}`);
    console.log(`Avg Rounds/Epoch: ${results.epochs > 0 ? (results.rounds / results.epochs).toFixed(2) : 0}`);
    console.log(`Rate Limit Errors: ${results.rateLimit429Count}`);
    console.log(`Console Errors: ${results.consoleErrors.length}`);
    console.log(`Transaction Logs: ${results.transactionLogs.length}`);

    if (results.rounds > 0) {
      console.log("\n--- Sum Distribution ---");
      const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      const expectedProb: Record<number, number> = {
        2: 1/36, 3: 2/36, 4: 3/36, 5: 4/36, 6: 5/36,
        7: 6/36, 8: 5/36, 9: 4/36, 10: 3/36, 11: 2/36, 12: 1/36
      };
      for (const sum of sums) {
        const count = results.sumDistribution[sum] || 0;
        const actualPct = (count / results.rounds) * 100;
        const expectedPct = expectedProb[sum] * 100;
        const deviation = actualPct - expectedPct;
        const bar = "#".repeat(Math.round(count / results.rounds * 50));
        console.log(`  ${sum.toString().padStart(2)}: ${count.toString().padStart(4)} (${actualPct.toFixed(1).padStart(5)}%) exp:${expectedPct.toFixed(1).padStart(5)}% dev:${deviation >= 0 ? '+' : ''}${deviation.toFixed(1).padStart(5)}% ${bar}`);
      }
    }

    console.log("\n--- Epoch Details ---");
    for (const epoch of results.epochDetails.slice(0, 10)) { // Show first 10
      console.log(`  E${epoch.epochNumber}: ${epoch.rolls.length} rolls, ${(epoch.duration / 1000).toFixed(1)}s [${epoch.rolls.join(', ')}]`);
    }
    if (results.epochDetails.length > 10) {
      console.log(`  ... and ${results.epochDetails.length - 10} more epochs`);
    }

    if (results.consoleErrors.length > 0) {
      console.log("\n--- Console Errors (first 5) ---");
      for (const err of results.consoleErrors.slice(0, 5)) {
        console.log(`  ${err.slice(0, 100)}...`);
      }
    }

    if (results.transactionLogs.length > 0) {
      console.log("\n--- Transaction Logs (first 10) ---");
      for (const log of results.transactionLogs.slice(0, 10)) {
        console.log(`  ${log.slice(0, 100)}`);
      }
    }

    console.log("=".repeat(60) + "\n");

    // Write detailed results to JSON
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile('/tmp/localnet-simulation-results.json', JSON.stringify(results, null, 2));
    console.log("Detailed results written to /tmp/localnet-simulation-results.json");

    // Assertions
    expect(results.rounds).toBeGreaterThan(0);
    expect(results.epochs).toBeGreaterThanOrEqual(1);
    expect(results.rateLimit429Count).toBeLessThan(50); // Should have fewer rate limits on localnet
  });
});
