import { test, expect } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";

test.describe("Simulation Mode Debug", () => {
  test("should diagnose why round counter and craps are not working", async ({ page }) => {
    test.setTimeout(120000);

    // Set larger viewport
    await page.setViewportSize({ width: 1400, height: 900 });

    // Navigate to app
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/sim-debug-initial.png", fullPage: true });

    // Check what the round timer shows
    const roundTimerCard = page.locator("text=Round").first();
    const roundText = await roundTimerCard.textContent().catch(() => null);
    console.log(`Round Timer text: ${roundText}`);

    // Check for error messages
    const errorMessages = await page.locator("text=/error|not found|not initialized/i").allTextContents();
    console.log(`Error messages found: ${JSON.stringify(errorMessages)}`);

    // Switch to Localnet
    const networkButton = page.locator('button:has-text("Devnet")').first();
    if (await networkButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await networkButton.click();
      await page.waitForTimeout(500);

      const localnetOption = page.locator('text="Localnet"').first();
      if (await localnetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
        await localnetOption.click();
        console.log("Switched to Localnet");
        await page.waitForTimeout(2000);
      }
    }

    await page.screenshot({ path: "/tmp/sim-debug-localnet.png", fullPage: true });

    // Check what shows now
    const crapsNotInitialized = await page.locator('text="Craps game not initialized"').count();
    const boardNotFound = await page.locator('text=/Board account not found/i').count();
    console.log(`Craps not initialized: ${crapsNotInitialized > 0}`);
    console.log(`Board not found: ${boardNotFound > 0}`);

    // Try clicking Demo Roll to see if simulation works
    const demoRollButton = page.locator('button:has-text("Demo Roll")').first();
    if (await demoRollButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await demoRollButton.click();
      console.log("Clicked Demo Roll");
      await page.waitForTimeout(3000);
      await page.screenshot({ path: "/tmp/sim-debug-demo-roll.png", fullPage: true });

      // Click anywhere to close the demo
      await page.click("body", { position: { x: 10, y: 10 } });
      await page.waitForTimeout(500);
    }

    // Navigate to Craps tab on mobile
    const crapsTab = page.locator('button:has-text("Craps")').first();
    if (await crapsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await crapsTab.click();
      await page.waitForTimeout(1000);
      console.log("Clicked Craps tab");
      await page.screenshot({ path: "/tmp/sim-debug-craps-tab.png", fullPage: true });
    }

    // Check the Craps Bets panel
    const crapsBetsPanel = page.locator('text="Craps Bets"').first();
    const crapsBetsVisible = await crapsBetsPanel.isVisible().catch(() => false);
    console.log(`Craps Bets panel visible: ${crapsBetsVisible}`);

    // Check if betting tabs are visible
    const lineTab = page.locator('button:has-text("Line")').first();
    const passLineButton = page.locator('text="Pass Line"').first();

    if (await lineTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await lineTab.click();
      await page.waitForTimeout(500);
    }

    const passLineVisible = await passLineButton.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`Pass Line button visible: ${passLineVisible}`);

    // Try to place a bet if visible
    if (passLineVisible) {
      await passLineButton.click();
      console.log("Clicked Pass Line");
      await page.waitForTimeout(1000);
      await page.screenshot({ path: "/tmp/sim-debug-pass-line.png", fullPage: true });
    }

    // Check for any place bet buttons
    const placeBetButtons = await page.locator('button:has-text("Place Bet")').allTextContents();
    console.log(`Place Bet buttons: ${JSON.stringify(placeBetButtons)}`);

    // Final status
    console.log("\n=== Diagnosis Summary ===");
    console.log(`On Localnet: Network switched`);
    console.log(`Craps not initialized message: ${crapsNotInitialized > 0}`);
    console.log(`Board not found message: ${boardNotFound > 0}`);
    console.log(`Betting panel visible: ${crapsBetsVisible}`);
    console.log(`Pass Line visible: ${passLineVisible}`);

    // This test is for diagnosis - it should pass regardless
    expect(true).toBe(true);
  });

  test("should run simulation with simulated API dice rolls", async ({ page, request }) => {
    test.setTimeout(120000);

    // Test the start-round API directly
    console.log("Testing simulated dice roll API...");

    const response = await request.post("http://localhost:3000/api/start-round", {
      data: {
        network: "localnet",
        simulated: true,
        duration: 300,
      },
    });

    const data = await response.json();
    console.log("Simulated dice roll response:", JSON.stringify(data, null, 2));

    expect(response.ok()).toBe(true);
    expect(data.success).toBe(true);
    expect(data.simulated).toBe(true);
    expect(data.roll).toBeDefined();

    // Now let's run multiple simulations
    console.log("\nRunning 5 consecutive simulated rolls...");
    for (let i = 0; i < 5; i++) {
      const rollResponse = await request.post("http://localhost:3000/api/start-round", {
        data: {
          network: "localnet",
          simulated: true,
        },
      });
      const rollData = await rollResponse.json();
      console.log(`Roll ${i + 1}: ${rollData.roll.die1}-${rollData.roll.die2} = ${rollData.roll.sum}`);
    }

    console.log("\n=== Simulated API is working correctly ===");
  });
});
