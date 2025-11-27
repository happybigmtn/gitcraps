import { test, expect } from "@playwright/test";

const TARGET_URL = "http://localhost:3000";

test.describe("Simulation Mode Verification", () => {
  test("should verify simulation mode enables craps betting", async ({ page }) => {
    test.setTimeout(60000);

    // Set larger viewport
    await page.setViewportSize({ width: 1400, height: 900 });

    // Navigate to app
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    // Take initial screenshot
    await page.screenshot({ path: "/tmp/sim-verify-initial.png", fullPage: true });

    // Switch to Localnet (this enables simulation mode)
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

    await page.screenshot({ path: "/tmp/sim-verify-localnet.png", fullPage: true });

    // Navigate to Craps tab if present
    const crapsTab = page.locator('button:has-text("Craps")').first();
    if (await crapsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await crapsTab.click();
      await page.waitForTimeout(1000);
      console.log("Clicked Craps tab");
    }

    await page.screenshot({ path: "/tmp/sim-verify-craps.png", fullPage: true });

    // Verify simulation mode is active - check for "(Sim)" indicator
    const simIndicator = page.locator('text=/\\(Sim\\)/i').first();
    const hasSimIndicator = await simIndicator.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Simulation indicator visible: ${hasSimIndicator}`);

    // Verify Craps Bets panel is visible (not "not initialized")
    const crapsBetsPanel = page.locator('text="Craps Bets"').first();
    const crapsBetsVisible = await crapsBetsPanel.isVisible().catch(() => false);
    console.log(`Craps Bets panel visible: ${crapsBetsVisible}`);

    // Check if "not initialized" message is gone
    const notInitialized = page.locator('text="Craps game not initialized"');
    const notInitializedCount = await notInitialized.count();
    console.log(`"Not initialized" message count: ${notInitializedCount}`);

    // Check if Line tab is accessible
    const lineTab = page.locator('button:has-text("Line")').first();
    const lineTabVisible = await lineTab.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Line tab visible: ${lineTabVisible}`);

    if (lineTabVisible) {
      await lineTab.click();
      await page.waitForTimeout(500);
    }

    // Check if Pass Line button is enabled
    const passLineButton = page.locator('button:has-text("Pass Line")').first();
    const passLineVisible = await passLineButton.isVisible({ timeout: 3000 }).catch(() => false);
    const passLineDisabled = await passLineButton.isDisabled().catch(() => true);
    console.log(`Pass Line button visible: ${passLineVisible}`);
    console.log(`Pass Line button disabled: ${passLineDisabled}`);

    await page.screenshot({ path: "/tmp/sim-verify-line-tab.png", fullPage: true });

    // Test assertions
    console.log("\n=== Verification Results ===");

    // In simulation mode on localnet:
    // - Craps Bets panel should be visible
    // - "Craps game not initialized" should NOT appear
    // - Pass Line button should be ENABLED (not disabled)

    expect(crapsBetsVisible).toBe(true);
    expect(notInitializedCount).toBe(0);

    // If Pass Line button is visible, it should be enabled
    if (passLineVisible) {
      expect(passLineDisabled).toBe(false);
      console.log("✓ Pass Line button is enabled in simulation mode!");
    }

    // Optionally check for simulation indicator
    if (hasSimIndicator) {
      console.log("✓ Simulation indicator is showing!");
    }

    console.log("\n=== Simulation Mode Verification PASSED ===");
  });

  test("should verify round counter shows simulation round", async ({ page }) => {
    test.setTimeout(60000);

    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

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

    // Check for "(Sim)" in the Round Timer area
    const simBadge = page.locator('text=/\\(Sim\\)/').first();
    const hasSimBadge = await simBadge.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Simulation badge in Round Timer: ${hasSimBadge}`);

    // Check for "Simulation Ready" or "Simulation Running" badge
    const simStatusBadge = page.locator('text=/Simulation (Ready|Running)/').first();
    const hasSimStatus = await simStatusBadge.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`Simulation status badge: ${hasSimStatus}`);

    await page.screenshot({ path: "/tmp/sim-verify-round.png", fullPage: true });

    // At least one simulation indicator should be visible
    expect(hasSimBadge || hasSimStatus).toBe(true);
    console.log("✓ Simulation mode indicators are working!");
  });
});
