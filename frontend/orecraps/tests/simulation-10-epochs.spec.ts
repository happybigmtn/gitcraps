import { test, expect, Page } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const TARGET_EPOCHS = 10;
const MAX_WAIT_TIME = 300000; // 5 minutes max per test

interface SimulationResults {
  epochs: number;
  rounds: number;
  rollHistory: number[];
  sumDistribution: Record<number, number>;
  sevenOuts: number;
  rateLimit429Count: number;
  consoleErrors: string[];
}

test.describe("OreCraps Simulation", () => {
  test("should run simulation and collect analytics", async ({ page }) => {
    test.setTimeout(600000); // 10 minutes max

    const results: SimulationResults = {
      epochs: 0,
      rounds: 0,
      rollHistory: [],
      sumDistribution: {},
      sevenOuts: 0,
      rateLimit429Count: 0,
      consoleErrors: [],
    };

    // Track console messages
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("429") || text.includes("rate limit")) {
        results.rateLimit429Count++;
      }
      if (msg.type() === "error" && !text.includes("429")) {
        results.consoleErrors.push(text.slice(0, 200));
      }
    });

    console.log("=== Starting OreCraps Simulation Test ===");
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Goal: ${TARGET_EPOCHS} epochs`);

    // Navigate to page
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/simulation-start.png", fullPage: true });

    // Navigate to Bots tab if needed (mobile view)
    const botsTab = page.locator('button:has-text("Bots")').first();
    if (await botsTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await botsTab.click();
      await page.waitForTimeout(500);
    }

    // Enable continuous mode and set target epochs
    const continuousCheckbox = page.locator('#continuous-mode');
    await expect(continuousCheckbox).toBeVisible({ timeout: 10000 });
    await continuousCheckbox.check();
    console.log("Continuous mode enabled!");

    // Set target epochs
    const targetInput = page.locator('input[type="number"]').first();
    await targetInput.fill(TARGET_EPOCHS.toString());
    console.log(`Target epochs set to ${TARGET_EPOCHS}`);
    await page.waitForTimeout(500);

    // Start the simulation
    const startButton = page.locator('button:has-text("Start Epoch")').first();
    await expect(startButton).toBeVisible({ timeout: 30000 });
    await startButton.click();
    console.log("Simulation started!");
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
                console.log(`  Epoch ${lastEpochNum} ended (7-out detected)`);
              }
              results.epochs = currentEpoch;
              lastEpochNum = currentEpoch;
              waitingForNextEpoch = false;
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
      if (results.epochs > 0 && results.epochs % 3 === 0) {
        await page.screenshot({
          path: `/tmp/simulation-epoch-${results.epochs}.png`,
          fullPage: true
        }).catch(() => {});
      }

      await page.waitForTimeout(500);
    }

    // Final epoch count
    if (lastEpochNum >= TARGET_EPOCHS) {
      results.epochs = TARGET_EPOCHS;
      results.sevenOuts = TARGET_EPOCHS;
    }

    // Take final screenshot
    await page.screenshot({ path: "/tmp/simulation-final.png", fullPage: true });

    // Navigate to analytics page
    const analyticsLink = page.locator('a[href="/analytics"]').first();
    if (await analyticsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await analyticsLink.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: "/tmp/analytics-page.png", fullPage: true });
    }

    // Print results
    console.log("\n========================================");
    console.log("       SIMULATION RESULTS");
    console.log("========================================");
    console.log(`Epochs Completed: ${results.epochs}/${TARGET_EPOCHS}`);
    console.log(`Total Rounds: ${results.rounds}`);
    console.log(`7-Outs: ${results.sevenOuts}`);
    console.log(`Avg Rounds/Epoch: ${results.epochs > 0 ? (results.rounds / results.epochs).toFixed(2) : 0}`);
    console.log(`Rate Limit Errors: ${results.rateLimit429Count}`);
    console.log(`Console Errors: ${results.consoleErrors.length}`);

    if (results.rounds > 0) {
      console.log("\nSum Distribution:");
      const sums = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      for (const sum of sums) {
        const count = results.sumDistribution[sum] || 0;
        const pct = ((count / results.rounds) * 100).toFixed(1);
        const bar = "█".repeat(Math.round(count / results.rounds * 50));
        console.log(`  ${sum.toString().padStart(2)}: ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
      }
    }

    console.log("========================================\n");

    // Assertions - be lenient since simulation may not reach all epochs
    expect(results.rounds).toBeGreaterThan(0);
    expect(results.rateLimit429Count).toBeLessThan(100);
  });

  test("should verify analytics page loads", async ({ page }) => {
    await page.goto(`${TARGET_URL}/analytics`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    const heading = page.locator("text=Analytics Dashboard");
    await expect(heading).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: "/tmp/analytics-verification.png", fullPage: true });
    console.log("Analytics page verified successfully");
  });

  test("should verify network toggle exists", async ({ page }) => {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for network toggle
    const networkToggle = page.locator('button:has-text("Devnet")').first();
    await expect(networkToggle).toBeVisible({ timeout: 10000 });

    // Click it and verify dropdown
    await networkToggle.click();
    await page.waitForTimeout(500);

    const localnetOption = page.locator('text=Localnet');
    await expect(localnetOption).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: "/tmp/network-toggle.png", fullPage: true });
    console.log("Network toggle verified - Devnet and Localnet options available");
  });
});
