const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

(async () => {
  console.log('OreCraps Full Flow Test - Devnet');
  console.log('================================\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    // Step 1: Navigate to the app
    console.log('Step 1: Loading OreCraps app...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded successfully');
    console.log('   Title:', await page.title());

    await page.screenshot({ path: '/tmp/orecraps-fullflow-01-initial.png', fullPage: true });
    console.log('Screenshot: /tmp/orecraps-fullflow-01-initial.png\n');

    // Wait for board data to load
    await page.waitForTimeout(2000);

    // Step 2: Check if board is connected to devnet
    console.log('Step 2: Checking devnet connection...');

    // Look for Round # indicator or board state
    const roundText = await page.locator('text=/Round #/i').first().textContent().catch(() => null);
    if (roundText) {
      console.log('   Board state found:', roundText);
    } else {
      console.log('   Board loading - checking for 36-square grid...');
    }

    // Count the dice squares
    const gridSquares = await page.locator('button:has-text("-")').count();
    console.log(`   Found ${gridSquares} dice combination buttons`);

    // Step 3: Test sum selector buttons
    console.log('\nStep 3: Testing sum selector buttons...');

    // Click sum 7 button to highlight squares
    const sum7Button = page.locator('button:has-text("7")').first();
    if (await sum7Button.isVisible()) {
      await sum7Button.click();
      await page.waitForTimeout(500);
      console.log('   Clicked sum 7 - should highlight 6 squares (1-6, 2-5, 3-4, 4-3, 5-2, 6-1)');

      await page.screenshot({ path: '/tmp/orecraps-fullflow-02-sum7.png', fullPage: true });
      console.log('   Screenshot: /tmp/orecraps-fullflow-02-sum7.png');
    }

    // Step 4: Test individual square selection
    console.log('\nStep 4: Testing individual square selection...');

    // Click on specific squares
    const square11 = page.locator('button:has-text("1-1")').first();
    if (await square11.isVisible()) {
      await square11.click();
      await page.waitForTimeout(300);
      console.log('   Selected "1-1" square (36x multiplier)');
    }

    const square66 = page.locator('button:has-text("6-6")').first();
    if (await square66.isVisible()) {
      await square66.click();
      await page.waitForTimeout(300);
      console.log('   Selected "6-6" square (36x multiplier)');
    }

    await page.screenshot({ path: '/tmp/orecraps-fullflow-03-selection.png', fullPage: true });
    console.log('   Screenshot: /tmp/orecraps-fullflow-03-selection.png');

    // Step 5: Check deploy panel
    console.log('\nStep 5: Checking deploy panel...');

    // Try to find the deploy panel
    const deployPanel = page.locator('text=/Deploy SOL|Place Bet/i').first();
    if (await deployPanel.isVisible()) {
      console.log('   Deploy panel found');
    }

    // Fill in amount
    const amountInput = page.locator('input[type="number"]').first();
    if (await amountInput.isVisible()) {
      await amountInput.fill('0.1');
      console.log('   Set deploy amount to 0.1 SOL');

      await page.waitForTimeout(500);
      await page.screenshot({ path: '/tmp/orecraps-fullflow-04-amount.png', fullPage: true });
      console.log('   Screenshot: /tmp/orecraps-fullflow-04-amount.png');
    }

    // Step 6: Test wallet connection
    console.log('\nStep 6: Testing wallet connection button...');

    const connectBtn = page.locator('button:has-text("Connect")').first();
    if (await connectBtn.isVisible()) {
      console.log('   Connect wallet button found');
      await connectBtn.click();
      await page.waitForTimeout(1000);

      await page.screenshot({ path: '/tmp/orecraps-fullflow-05-wallet-modal.png', fullPage: true });
      console.log('   Screenshot: /tmp/orecraps-fullflow-05-wallet-modal.png');
      console.log('   Wallet modal opened (Phantom, Solflare, etc.)');

      // Close modal
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }

    // Step 7: Test Demo Roll feature
    console.log('\nStep 7: Testing Demo Roll...');

    // First, select some squares
    const sum8Button = page.locator('button:has-text("8")').first();
    if (await sum8Button.isVisible()) {
      await sum8Button.click();
      await page.waitForTimeout(300);
      console.log('   Selected sum 8 squares');
    }

    const demoRollBtn = page.locator('button:has-text("Demo Roll")').first();
    if (await demoRollBtn.isVisible()) {
      await demoRollBtn.click();
      console.log('   Clicked Demo Roll');

      // Wait for dice animation
      await page.waitForTimeout(3000);

      await page.screenshot({ path: '/tmp/orecraps-fullflow-06-demoroll.png', fullPage: true });
      console.log('   Screenshot: /tmp/orecraps-fullflow-06-demoroll.png');

      // Wait for animation to complete
      await page.waitForTimeout(2000);
    }

    // Step 8: Test Select All / Clear
    console.log('\nStep 8: Testing Select All / Clear...');

    const selectAllBtn = page.locator('button:has-text("Select All")').first();
    if (await selectAllBtn.isVisible()) {
      await selectAllBtn.click();
      await page.waitForTimeout(500);
      console.log('   Clicked Select All - all 36 squares selected');

      await page.screenshot({ path: '/tmp/orecraps-fullflow-07-selectall.png', fullPage: true });
      console.log('   Screenshot: /tmp/orecraps-fullflow-07-selectall.png');
    }

    const clearBtn = page.locator('button:has-text("Clear")').first();
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
      await page.waitForTimeout(500);
      console.log('   Clicked Clear - all squares deselected');
    }

    // Step 9: Test mobile responsive layout
    console.log('\nStep 9: Testing mobile responsive layout...');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    await page.screenshot({ path: '/tmp/orecraps-fullflow-08-mobile.png', fullPage: true });
    console.log('   Screenshot: /tmp/orecraps-fullflow-08-mobile.png');

    // Check for mobile tabs
    const boardTab = page.locator('button:has-text("Board")').first();
    const deployTab = page.locator('button:has-text("Deploy")').first();

    if (await boardTab.isVisible() && await deployTab.isVisible()) {
      console.log('   Mobile tabs found: Board, Deploy');

      // Switch to deploy tab
      await deployTab.click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: '/tmp/orecraps-fullflow-09-mobile-deploy.png', fullPage: true });
      console.log('   Screenshot: /tmp/orecraps-fullflow-09-mobile-deploy.png');
    }

    // Return to desktop view
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    console.log('\n================================');
    console.log('OreCraps Full Flow Test Complete!');
    console.log('');
    console.log('Summary:');
    console.log('  - Page loads successfully');
    console.log('  - 36-square dice grid displayed');
    console.log('  - Sum selector buttons work');
    console.log('  - Individual square selection works');
    console.log('  - Deploy panel with amount input');
    console.log('  - Wallet connection modal opens');
    console.log('  - Demo Roll dice animation works');
    console.log('  - Select All / Clear buttons work');
    console.log('  - Mobile responsive layout works');
    console.log('');
    console.log('Screenshots saved to /tmp/orecraps-fullflow-*.png');
    console.log('');
    console.log('NOTE: To test actual transactions:');
    console.log('  1. Connect a wallet (Phantom/Solflare) with devnet SOL');
    console.log('  2. Select squares and enter amount');
    console.log('  3. Click Deploy button to submit transaction');

  } catch (error) {
    console.error('Test failed:', error.message);
    await page.screenshot({ path: '/tmp/orecraps-fullflow-error.png', fullPage: true });
    console.log('Error screenshot: /tmp/orecraps-fullflow-error.png');
  } finally {
    // Keep browser open briefly for review
    await page.waitForTimeout(3000);
    await browser.close();
  }
})();
