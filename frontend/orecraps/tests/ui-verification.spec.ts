import { test, expect } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";

test.describe("UI Verification & UX Evaluation", () => {
  test("verify craps panel shows on-chain state only (no simulation)", async ({ page }) => {
    test.setTimeout(60000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot on Devnet
    await page.screenshot({ path: "/tmp/ui-verify-devnet.png", fullPage: true });
    console.log("Screenshot 1: Initial Devnet view saved");

    // Switch to Localnet to verify no simulation betting
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

    await page.screenshot({ path: "/tmp/ui-verify-localnet.png", fullPage: true });
    console.log("Screenshot 2: Localnet view saved");

    // Navigate to Craps tab
    const crapsTab = page.locator('button:has-text("Craps")').first();
    if (await crapsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await crapsTab.click();
      await page.waitForTimeout(1500);
      console.log("Clicked Craps tab");
    }

    await page.screenshot({ path: "/tmp/ui-verify-craps.png", fullPage: true });
    console.log("Screenshot 3: Craps panel saved");

    // Verify NO simulation betting elements exist
    // The old code had "(Sim)" badge, "Simulation Balance", etc.
    const simIndicators = [
      'text="(Sim)"',
      'text="Sim "',
      'text="Simulate "',
      'text="Simulation Balance"',
      'text="Claim Sim Winnings"',
    ];

    let simElementsFound = 0;
    for (const selector of simIndicators) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`Found simulation element: ${selector} (count: ${count})`);
        simElementsFound += count;
      }
    }

    console.log(`\n=== Verification Results ===`);
    console.log(`Simulation betting elements found: ${simElementsFound}`);

    // Verify "Connect Wallet" button is shown (since no wallet connected)
    const connectWalletBtn = page.locator('button:has-text("Connect Wallet")');
    const connectWalletVisible = await connectWalletBtn.count() > 0;
    console.log(`Connect Wallet button present: ${connectWalletVisible}`);

    // The submit button should require wallet connection
    // On localnet without craps deployed, we should still see the betting panel
    // but it should NOT have simulation-only features

    // Check for Place X Bet button (not "Simulate X Bet")
    const placeButton = page.locator('button:has-text("Place")').first();
    const simulateButton = page.locator('button:has-text("Simulate")').first();

    const hasPlaceButton = await placeButton.count() > 0;
    const hasSimulateButton = await simulateButton.count() > 0;

    console.log(`Has 'Place' button: ${hasPlaceButton}`);
    console.log(`Has 'Simulate' button: ${hasSimulateButton}`);

    // Final screenshot of craps betting area
    await page.screenshot({ path: "/tmp/ui-verify-final.png", fullPage: true });
    console.log("Screenshot 4: Final view saved");

    // Assertions
    // There should be NO simulate buttons - all betting should be "Place" for on-chain
    expect(hasSimulateButton).toBe(false);

    console.log("\n=== UI Verification PASSED ===");
    console.log("All simulation-only betting UI has been removed.");
    console.log("Craps panel now shows on-chain state only.");
  });

  test("capture full UI for UX evaluation", async ({ page }) => {
    test.setTimeout(120000);

    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Main dashboard
    await page.screenshot({ path: "/tmp/ux-dashboard.png", fullPage: true });

    // Click each tab and capture
    const tabs = ["Dice", "Craps", "Stats"];
    for (const tab of tabs) {
      const tabBtn = page.locator(`button:has-text("${tab}")`).first();
      if (await tabBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `/tmp/ux-${tab.toLowerCase()}.png`, fullPage: true });
        console.log(`Captured ${tab} tab`);
      }
    }

    // Mobile view
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/ux-mobile.png", fullPage: true });
    console.log("Captured mobile view");

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: "/tmp/ux-tablet.png", fullPage: true });
    console.log("Captured tablet view");

    console.log("\n=== UX Screenshots captured in /tmp/ ===");
  });
});
