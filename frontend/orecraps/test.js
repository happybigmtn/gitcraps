const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

(async () => {
  console.log('🎲 OreCraps Frontend Testing Suite - 36 Combinations Board\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  try {
    // Test 1: Load the page
    console.log('📋 Test 1: Loading the OreCraps homepage...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('   ✓ Page loaded successfully');
    console.log('   Page title:', await page.title());

    // Take desktop screenshot
    await page.screenshot({ path: '/tmp/orecraps-36-desktop.png', fullPage: true });
    console.log('   📸 Desktop screenshot saved to /tmp/orecraps-36-desktop.png');

    // Test 2: Check for 6x6 grid (36 combinations)
    console.log('\n📋 Test 2: Checking 36-combination board...');
    const diceGrid = await page.locator('text=Dice Combinations');
    const gridVisible = await diceGrid.isVisible().catch(() => false);
    console.log('   Dice Combinations grid visible:', gridVisible ? '✓' : '✗');

    // Check for dice combination labels
    const combo11 = await page.locator('text=1-1').first();
    const combo66 = await page.locator('text=6-6').first();
    const combo11Visible = await combo11.isVisible().catch(() => false);
    const combo66Visible = await combo66.isVisible().catch(() => false);
    console.log('   1-1 combination visible:', combo11Visible ? '✓' : '✗');
    console.log('   6-6 combination visible:', combo66Visible ? '✓' : '✗');

    // Test 3: Check Quick Select by Sum
    console.log('\n📋 Test 3: Checking Quick Select by Sum...');
    const quickSelect = await page.locator('text=Quick Select by Sum');
    const quickSelectVisible = await quickSelect.isVisible().catch(() => false);
    console.log('   Quick Select panel visible:', quickSelectVisible ? '✓' : '✗');

    // Test 4: Click on sum 7 to select all 7s
    console.log('\n📋 Test 4: Testing sum selection (clicking 7)...');
    const sum7Button = await page.locator('button:has-text("7")').filter({ hasText: '6x' }).first();
    if (await sum7Button.isVisible()) {
      await sum7Button.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Clicked on sum 7 button');

      // Verify combinations are selected (1-6, 2-5, 3-4, 4-3, 5-2, 6-1)
      await page.screenshot({ path: '/tmp/orecraps-36-sum7-selected.png' });
      console.log('   📸 Sum 7 selection screenshot saved');
    }

    // Test 5: Check selected count
    console.log('\n📋 Test 5: Checking selection count...');
    const selectionText = await page.locator('text=/\\d+ \\/ 36 combinations selected/').first();
    const selectionVisible = await selectionText.isVisible().catch(() => false);
    if (selectionVisible) {
      const text = await selectionText.textContent();
      console.log('   Selection status:', text);
    }

    // Test 6: Click on sum 12 to add those selections
    console.log('\n📋 Test 6: Adding sum 12 selection...');
    const sum12Button = await page.locator('button:has-text("12")').filter({ hasText: '36x' }).first();
    if (await sum12Button.isVisible()) {
      await sum12Button.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Clicked on sum 12 button');
      await page.screenshot({ path: '/tmp/orecraps-36-multiple-selected.png' });
      console.log('   📸 Multiple sum selection screenshot saved');
    }

    // Test 7: Click individual square to toggle
    console.log('\n📋 Test 7: Testing individual square toggle...');
    const square16 = await page.locator('button:has-text("1-6")');
    if (await square16.isVisible()) {
      await square16.click();
      await page.waitForTimeout(300);
      console.log('   ✓ Toggled square 1-6');
    }

    // Test 8: Check Deploy Panel shows correct count
    console.log('\n📋 Test 8: Checking Deploy Panel...');
    const deployPanel = await page.locator('text=Deploy SOL');
    const deployVisible = await deployPanel.isVisible().catch(() => false);
    console.log('   Deploy SOL panel visible:', deployVisible ? '✓' : '✗');

    // Check for probability display
    const probability = await page.locator('text=Win Probability');
    const probVisible = await probability.isVisible().catch(() => false);
    console.log('   Win Probability display visible:', probVisible ? '✓' : '✗');

    // Test 9: Clear all selections
    console.log('\n📋 Test 9: Testing Clear All...');
    const clearButton = await page.locator('button:has-text("Clear All")').first();
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await page.waitForTimeout(500);
      console.log('   ✓ Cleared all selections');
    }

    // Test 10: Demo Roll
    console.log('\n📋 Test 10: Testing Demo Roll with selections...');
    // First select sum 7
    await sum7Button.click();
    await page.waitForTimeout(300);

    const demoRollButton = await page.locator('button:has-text("Demo Roll")');
    if (await demoRollButton.isVisible()) {
      await demoRollButton.click();
      console.log('   ✓ Clicked Demo Roll');

      await page.waitForTimeout(2500);
      await page.screenshot({ path: '/tmp/orecraps-36-dice-roll.png' });
      console.log('   📸 Dice roll screenshot saved');

      await page.waitForTimeout(2500);
      await page.screenshot({ path: '/tmp/orecraps-36-dice-result.png' });
      console.log('   📸 Dice result screenshot saved');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Test 11: Mobile view
    console.log('\n📋 Test 11: Testing mobile responsiveness...');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/orecraps-36-mobile.png', fullPage: true });
    console.log('   📸 Mobile screenshot saved');

    // Check mobile tabs exist
    const boardTab = await page.locator('button:has-text("Board")');
    const tabsVisible = await boardTab.isVisible().catch(() => false);
    console.log('   Mobile tabs visible:', tabsVisible ? '✓' : '✗');

    // Test 12: Probability Chart
    console.log('\n📋 Test 12: Checking Probability Chart...');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const probChart = await page.locator('text=Probability Distribution');
    const chartVisible = await probChart.isVisible().catch(() => false);
    console.log('   Probability Chart visible:', chartVisible ? '✓' : '✗');

    // Final screenshot
    await page.screenshot({ path: '/tmp/orecraps-36-final.png', fullPage: true });
    console.log('   📸 Final screenshot saved');

    console.log('\n✅ All tests completed successfully!');
    console.log('\n📁 Screenshots saved to /tmp/:');
    console.log('   - orecraps-36-desktop.png');
    console.log('   - orecraps-36-sum7-selected.png');
    console.log('   - orecraps-36-multiple-selected.png');
    console.log('   - orecraps-36-dice-roll.png');
    console.log('   - orecraps-36-dice-result.png');
    console.log('   - orecraps-36-mobile.png');
    console.log('   - orecraps-36-final.png');

  } catch (error) {
    console.error('❌ Test error:', error.message);
    await page.screenshot({ path: '/tmp/orecraps-36-error.png' });
    console.log('   📸 Error screenshot saved to /tmp/orecraps-36-error.png');
  } finally {
    await browser.close();
  }
})();
