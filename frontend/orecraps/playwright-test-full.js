const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

(async () => {
  console.log('=================================================');
  console.log('OreCraps Full Workflow Test');
  console.log('=================================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Enable console log capture
  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('Round') || msg.text().includes('API')) {
      console.log(`   [Browser]: ${msg.text()}`);
    }
  });

  try {
    // Test 1: Page Load
    console.log('Test 1: Page Load');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    console.log('   Page loaded successfully');
    await page.screenshot({ path: '/tmp/test-1-initial.png', fullPage: true });

    // Test 2: Check Bot Leaderboard
    console.log('\nTest 2: Check Bot Leaderboard');
    const leaderboard = await page.locator('text=Bot Leaderboard').first();
    if (await leaderboard.isVisible()) {
      console.log('   Bot Leaderboard visible');
    } else {
      console.log('   WARNING: Bot Leaderboard not found');
    }

    // Test 3: API Direct Test - Start Round
    console.log('\nTest 3: API Direct Test - Start Round');
    const apiResponse = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/start-round', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 300 }),
        });
        const data = await response.json();
        return { status: response.status, data };
      } catch (e) {
        return { error: e.message };
      }
    });
    console.log('   API Response:', JSON.stringify(apiResponse, null, 2));

    if (apiResponse.data?.success) {
      console.log('   Round started successfully via API!');
      if (apiResponse.data?.signature) {
        console.log(`   Transaction: ${apiResponse.data.signature}`);
      }
    } else {
      console.log('   API Error:', apiResponse.data?.error || apiResponse.error);
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/test-3-after-api.png', fullPage: true });

    // Test 4: Click Run Button
    console.log('\nTest 4: Click Run Button');
    const runBtn = await page.locator('button:has-text("Run")').first();
    if (await runBtn.isVisible()) {
      console.log('   Found Run button, clicking...');
      await runBtn.click();
      console.log('   Clicked Run button');

      // Wait for response
      await page.waitForTimeout(5000);

      // Check for success or error message
      const successMsg = await page.locator('text=Round started').first();
      const errorMsg = await page.locator('.text-destructive').first();
      const txMsg = await page.locator('text=Tx:').first();

      if (await txMsg.isVisible()) {
        console.log('   SUCCESS: Transaction submitted');
      } else if (await successMsg.isVisible()) {
        console.log('   SUCCESS: Round started');
      } else if (await errorMsg.isVisible()) {
        const errorText = await errorMsg.textContent();
        console.log('   ERROR:', errorText);
      }
    } else {
      console.log('   Run button not visible');
    }
    await page.screenshot({ path: '/tmp/test-4-after-run.png', fullPage: true });

    // Test 5: Check Round Timer
    console.log('\nTest 5: Check Round Timer');
    const timerElements = await page.locator('text=/\\d+:\\d+/').all();
    if (timerElements.length > 0) {
      for (const timer of timerElements.slice(0, 3)) {
        const text = await timer.textContent();
        console.log(`   Timer found: ${text}`);
      }
    } else {
      console.log('   No timer elements found');
    }

    // Test 6: Monitor Bot Activity
    console.log('\nTest 6: Monitor Bot Activity for 10 seconds...');
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(2000);

      // Check for bot deployed squares
      const deployedSquares = await page.locator('text=/\\d+sq/').all();
      if (deployedSquares.length > 0) {
        const texts = await Promise.all(deployedSquares.map(el => el.textContent()));
        console.log(`   [${i*2}s] Bot squares: ${texts.join(', ')}`);
      }

      // Check for PnL changes
      const pnlElements = await page.locator('text=/[+-]\\d+\\.\\d+%/').all();
      if (pnlElements.length > 0) {
        const texts = await Promise.all(pnlElements.slice(0, 3).map(el => el.textContent()));
        console.log(`   [${i*2}s] PnL values: ${texts.join(', ')}`);
      }
    }
    await page.screenshot({ path: '/tmp/test-6-bot-activity.png', fullPage: true });

    // Test 7: Check Board State
    console.log('\nTest 7: Check Mining Board');
    const squares = await page.locator('[data-square]').all();
    console.log(`   Found ${squares.length} board squares`);

    // Check for any highlighted/selected squares
    const highlightedSquares = await page.locator('.bg-yellow-500, .bg-green-500, .bg-blue-500').all();
    console.log(`   Highlighted squares: ${highlightedSquares.length}`);

    // Test 8: Check for any errors in the page
    console.log('\nTest 8: Check for Errors');
    const allErrors = await page.locator('.text-destructive, .text-red-500').all();
    if (allErrors.length > 0) {
      for (const error of allErrors.slice(0, 5)) {
        const text = await error.textContent();
        if (text && text.trim()) {
          console.log(`   Error element: ${text.substring(0, 100)}`);
        }
      }
    } else {
      console.log('   No error elements found');
    }

    await page.screenshot({ path: '/tmp/test-final.png', fullPage: true });

    console.log('\n=================================================');
    console.log('Test Complete!');
    console.log('Screenshots saved to /tmp/test-*.png');
    console.log('=================================================');

  } catch (error) {
    console.error('\nTest Error:', error.message);
    await page.screenshot({ path: '/tmp/test-error.png', fullPage: true });
  } finally {
    // Keep browser open for a moment for manual inspection
    await page.waitForTimeout(5000);
    await browser.close();
  }
})();
