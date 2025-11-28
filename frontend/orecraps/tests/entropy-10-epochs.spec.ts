import { test, expect, Page } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";
const TARGET_EPOCHS = 10;
const ENTROPY_API = `${TARGET_URL}/api/entropy`;
const MAX_WAIT_TIME = 600000; // 10 minutes max

interface EntropyTestResults {
  epochs: number;
  rolls: {
    epoch: number;
    die1: number;
    die2: number;
    sum: number;
    winningSquare: number;
    varAddress: string;
    txSignatures: string[];
  }[];
  entropyApiCalls: {
    action: string;
    success: boolean;
    timestamp: number;
    response?: any;
    error?: string;
  }[];
  screenshots: string[];
  errors: string[];
  startTime: number;
  endTime: number;
}

test.describe("Entropy VRF 10-Epoch Test", () => {
  test("10 epochs with on-chain entropy commit-reveal", async ({ page }) => {
    test.setTimeout(900000); // 15 minutes max

    const results: EntropyTestResults = {
      epochs: 0,
      rolls: [],
      entropyApiCalls: [],
      screenshots: [],
      errors: [],
      startTime: Date.now(),
      endTime: 0,
    };

    // Track console messages
    page.on("console", (msg) => {
      const text = msg.text();
      if (msg.type() === "error") {
        results.errors.push(`[CONSOLE] ${text}`);
      }
      // Log entropy-related messages
      if (text.includes("entropy") || text.includes("VRF") || text.includes("roll")) {
        console.log(`  [Frontend] ${text.slice(0, 200)}`);
      }
    });

    console.log("=".repeat(70));
    console.log("  ENTROPY VRF 10-EPOCH TEST - ON-CHAIN COMMIT-REVEAL");
    console.log("=".repeat(70));
    console.log(`Target: ${TARGET_URL}`);
    console.log(`Entropy API: ${ENTROPY_API}`);
    console.log(`Goal: ${TARGET_EPOCHS} epochs using real on-chain entropy`);
    console.log("");

    // First, verify the entropy API is working with a test full-cycle
    console.log("[SETUP] Testing entropy API connectivity...");
    try {
      const apiTest = await fetch(ENTROPY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "full-cycle", network: "localnet" }),
      });
      const apiTestText = await apiTest.text();
      let apiTestResult;
      try {
        apiTestResult = JSON.parse(apiTestText);
      } catch {
        apiTestResult = { raw: apiTestText };
      }
      console.log(`  API Test Result: ${JSON.stringify(apiTestResult).slice(0, 200)}`);
      results.entropyApiCalls.push({
        action: "test",
        success: apiTest.ok && apiTestResult.success,
        timestamp: Date.now(),
        response: apiTestResult,
      });

      if (!apiTestResult.success) {
        console.log(`[WARN] Initial test failed, continuing anyway: ${apiTestResult.error || "unknown"}`);
      }
    } catch (error) {
      console.log(`[WARN] API connectivity test failed: ${error}`);
    }

    // Navigate to page
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/entropy-start.png", fullPage: true });
    results.screenshots.push("/tmp/entropy-start.png");
    console.log("[SETUP] Initial page loaded");

    // Switch to Localnet
    console.log("[SETUP] Switching to Localnet...");
    const networkToggle = page.locator('button:has-text("Devnet")').first();
    if (await networkToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await networkToggle.click();
      await page.waitForTimeout(500);
      const localnetOption = page.locator('text=Localnet');
      if (await localnetOption.isVisible({ timeout: 3000 })) {
        await localnetOption.click();
        console.log("[SETUP] Switched to Localnet!");
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: "/tmp/entropy-network.png", fullPage: true });
    results.screenshots.push("/tmp/entropy-network.png");

    // Run 10 epochs
    for (let epoch = 1; epoch <= TARGET_EPOCHS; epoch++) {
      console.log(`\n${"=".repeat(50)}`);
      console.log(`  EPOCH ${epoch}/${TARGET_EPOCHS}`);
      console.log("=".repeat(50));

      // Screenshot before roll
      await page.screenshot({
        path: `/tmp/entropy-epoch-${epoch}-before.png`,
        fullPage: true
      });
      results.screenshots.push(`/tmp/entropy-epoch-${epoch}-before.png`);

      // Call entropy API for full commit-reveal cycle
      console.log(`[E${epoch}] Starting entropy full-cycle...`);
      const startTime = Date.now();

      try {
        const entropyResponse = await fetch(ENTROPY_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "full-cycle",
            network: "localnet",
          }),
        });

        const responseText = await entropyResponse.text();
        let entropyResult;
        try {
          entropyResult = JSON.parse(responseText);
        } catch {
          entropyResult = { success: false, error: "Invalid JSON", raw: responseText.slice(0, 200) };
        }
        const duration = Date.now() - startTime;

        results.entropyApiCalls.push({
          action: "full-cycle",
          success: entropyResponse.ok && entropyResult.success,
          timestamp: Date.now(),
          response: entropyResult,
        });

        if (entropyResult.success && entropyResult.diceResult) {
          const dice = entropyResult.diceResult;
          console.log(`[E${epoch}] SUCCESS in ${duration}ms:`);
          console.log(`  Dice: ${dice.die1}-${dice.die2} = ${dice.sum}`);
          console.log(`  Winning Square: ${dice.winningSquare}`);
          console.log(`  Var Address: ${entropyResult.varAddress}`);
          console.log(`  TX Signatures: ${entropyResult.results?.length || 0}`);

          results.rolls.push({
            epoch,
            die1: dice.die1,
            die2: dice.die2,
            sum: dice.sum,
            winningSquare: dice.winningSquare,
            varAddress: entropyResult.varAddress || "",
            txSignatures: entropyResult.results || [],
          });

          // Validate dice values
          if (dice.die1 < 1 || dice.die1 > 6 || dice.die2 < 1 || dice.die2 > 6) {
            results.errors.push(`E${epoch}: Invalid dice values ${dice.die1}-${dice.die2}`);
          }
          if (dice.die1 + dice.die2 !== dice.sum) {
            results.errors.push(`E${epoch}: Dice math error ${dice.die1}+${dice.die2}!=${dice.sum}`);
          }
          if (dice.winningSquare < 0 || dice.winningSquare >= 36) {
            results.errors.push(`E${epoch}: Invalid winning square ${dice.winningSquare}`);
          }

          results.epochs++;
        } else {
          console.log(`[E${epoch}] FAILED: ${JSON.stringify(entropyResult)}`);
          results.errors.push(`E${epoch}: Entropy cycle failed - ${entropyResult.error || "unknown"}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[E${epoch}] ERROR: ${errorMsg}`);
        results.entropyApiCalls.push({
          action: "full-cycle",
          success: false,
          timestamp: Date.now(),
          error: errorMsg,
        });
        results.errors.push(`E${epoch}: ${errorMsg}`);
      }

      // Screenshot after roll
      await page.screenshot({
        path: `/tmp/entropy-epoch-${epoch}-after.png`,
        fullPage: true
      });
      results.screenshots.push(`/tmp/entropy-epoch-${epoch}-after.png`);

      // Wait between epochs to let slots advance
      if (epoch < TARGET_EPOCHS) {
        console.log(`[E${epoch}] Waiting 3s before next epoch...`);
        await page.waitForTimeout(3000);
      }
    }

    results.endTime = Date.now();

    // Final screenshot
    await page.screenshot({ path: "/tmp/entropy-final.png", fullPage: true });
    results.screenshots.push("/tmp/entropy-final.png");

    // Print results
    console.log("\n" + "=".repeat(70));
    console.log("       ENTROPY VRF TEST RESULTS");
    console.log("=".repeat(70));
    console.log(`Duration: ${((results.endTime - results.startTime) / 1000).toFixed(1)}s`);
    console.log(`Successful Epochs: ${results.epochs}/${TARGET_EPOCHS}`);
    console.log(`Total Rolls: ${results.rolls.length}`);
    console.log(`API Calls: ${results.entropyApiCalls.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Dice distribution
    if (results.rolls.length > 0) {
      console.log("\n--- Dice Sum Distribution ---");
      const sumDist: Record<number, number> = {};
      for (const roll of results.rolls) {
        sumDist[roll.sum] = (sumDist[roll.sum] || 0) + 1;
      }
      for (let sum = 2; sum <= 12; sum++) {
        const count = sumDist[sum] || 0;
        const pct = ((count / results.rolls.length) * 100).toFixed(1);
        console.log(`  ${sum.toString().padStart(2)}: ${count.toString().padStart(3)} (${pct}%)`);
      }

      console.log("\n--- Roll Details ---");
      for (const roll of results.rolls) {
        console.log(`  E${roll.epoch}: ${roll.die1}-${roll.die2}=${roll.sum} (sq ${roll.winningSquare})`);
      }
    }

    // Entropy API stats
    console.log("\n--- Entropy API Stats ---");
    const successful = results.entropyApiCalls.filter(c => c.success).length;
    const failed = results.entropyApiCalls.filter(c => !c.success).length;
    console.log(`  Successful: ${successful}`);
    console.log(`  Failed: ${failed}`);

    // Errors
    if (results.errors.length > 0) {
      console.log("\n--- Errors ---");
      for (const err of results.errors) {
        console.log(`  ${err}`);
      }
    }

    // Screenshots
    console.log("\n--- Screenshots ---");
    console.log(`  Total: ${results.screenshots.length}`);
    for (const ss of results.screenshots.slice(0, 10)) {
      console.log(`  ${ss}`);
    }

    console.log("=".repeat(70) + "\n");

    // Write results to JSON
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile('/tmp/entropy-results.json', JSON.stringify(results, null, 2));
    console.log("Detailed results written to /tmp/entropy-results.json");

    // Assertions
    expect(results.epochs).toBeGreaterThanOrEqual(TARGET_EPOCHS * 0.8); // Allow 20% failure
    expect(results.rolls.length).toBeGreaterThan(0);

    // Check for dice value errors
    const diceErrors = results.errors.filter(e =>
      e.includes("Invalid dice") || e.includes("Dice math")
    );
    expect(diceErrors.length).toBe(0);
  });
});
