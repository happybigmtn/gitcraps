const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

(async () => {
  console.log('=================================================');
  console.log('OreCraps Bet Resolution Test');
  console.log('=================================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Track round changes
  let lastTimer = null;
  let roundEnded = false;

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Round') || text.includes('resolution') || text.includes('winner')) {
      console.log(`   [Browser]: ${text}`);
    }
  });

  try {
    // Load page
    console.log('Loading page...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Start a new round by clicking Run button (this triggers both API and local simulation)
    console.log('\nClicking Run button to start round...');
    const runBtn = await page.locator('button:has-text("Run")').first();
    if (await runBtn.isVisible()) {
      await runBtn.click();
      console.log('Run button clicked, waiting for round to start...');

      // Wait for success message or loading to complete
      await page.waitForTimeout(15000); // Wait for API call to complete

      // Check for success
      const successMsg = await page.locator('text=Tx:').first();
      if (await successMsg.isVisible().catch(() => false)) {
        const text = await successMsg.textContent();
        console.log(`Round started! ${text}`);
      }
    } else {
      console.log('Run button not visible, trying API directly...');
      const apiResponse = await page.evaluate(async () => {
        const response = await fetch('/api/start-round', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration: 150 }),
        });
        return response.json();
      });
      console.log('API response:', apiResponse.success ? 'Success' : apiResponse.error);
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/tmp/resolution-1-start.png', fullPage: true });

    // Monitor the round for up to 3 minutes
    console.log('\nMonitoring round progress (waiting for timer to reach 0)...');
    console.log('This will take about 2 minutes...\n');

    let previousPnl = {};
    let previousSquares = {};
    let timerReachedZero = false;

    for (let i = 0; i < 80; i++) { // 80 iterations * 3 seconds = 4 minutes max
      await page.waitForTimeout(3000);

      // Get timer - look for Time Remaining label and nearby timer value
      let timerText = '??:??';
      try {
        // Find the specific timer element in the round header
        const timerElement = await page.locator('text=Time Remaining').locator('..').locator('text=/^\\d+:\\d+$/').first();
        if (await timerElement.isVisible()) {
          timerText = await timerElement.textContent();
        }
      } catch (e) {
        // Fallback: try to find any M:SS pattern that looks like a timer
        const allTimers = await page.locator('text=/^[0-9]:[0-5][0-9]$/').all();
        for (const t of allTimers) {
          const text = await t.textContent().catch(() => '');
          if (text.match(/^[0-9]:[0-5][0-9]$/)) {
            timerText = text;
            break;
          }
        }
      }

      // Parse time remaining
      const [mins, secs] = timerText.split(':').map(Number);
      // Only consider it 0 if we're at least 60 seconds into the test
      const totalSecs = isNaN(mins) ? 999 : (mins * 60) + secs;
      const effectiveSecs = (i * 3 < 60 && totalSecs === 0) ? 999 : totalSecs;

      // Get bot PnL values
      const pnlElements = await page.locator('text=/[+-]\\d+\\.\\d+%/').all();
      const pnlValues = await Promise.all(pnlElements.slice(0, 5).map(el => el.textContent().catch(() => '0%')));

      // Get bot square counts
      const squareElements = await page.locator('text=/\\d+sq/').all();
      const squareValues = await Promise.all(squareElements.slice(0, 5).map(el => el.textContent().catch(() => '0sq')));

      // Check for changes
      const pnlChanged = JSON.stringify(pnlValues) !== JSON.stringify(Object.values(previousPnl));
      const squaresChanged = JSON.stringify(squareValues) !== JSON.stringify(Object.values(previousSquares));

      // Log status
      const status = `[${String(i * 3).padStart(3)}s] Timer: ${timerText} | PnL: ${pnlValues.join(', ')} | Squares: ${squareValues.join(', ')}`;

      if (pnlChanged || squaresChanged || i % 10 === 0 || totalSecs <= 30) {
        console.log(status);

        if (pnlChanged && i > 5) {
          console.log('   *** PnL CHANGED! Bet resolution occurred ***');
        }
      }

      previousPnl = pnlValues;
      previousSquares = squareValues;

      // Check if timer reached 0 (using effectiveSecs to ignore early false positives)
      if (effectiveSecs <= 0) {
        console.log('\n=== TIMER REACHED 0 ===');
        timerReachedZero = true;
        await page.screenshot({ path: '/tmp/resolution-2-timer-zero.png', fullPage: true });

        // Call reset API to resolve the round
        console.log('\nCalling reset API to resolve round...');
        const resetResponse = await page.evaluate(async () => {
          try {
            const response = await fetch('/api/reset-round', {
              method: 'POST',
            });
            return response.json();
          } catch (e) {
            return { error: e.message };
          }
        });

        if (resetResponse.success) {
          console.log('Reset successful!', resetResponse.signature?.slice(0, 16) || '');
          console.log('Output:', resetResponse.output?.slice(0, 200));
        } else {
          console.log('Reset error:', resetResponse.error || resetResponse.details);
        }

        // Wait for board to refresh and bet resolution to occur
        console.log('\nWaiting for bet resolution...');
        await page.waitForTimeout(10000);

        roundEnded = true;
        await page.screenshot({ path: '/tmp/resolution-3-after-reset.png', fullPage: true });
        break;
      }

      // Take periodic screenshots
      if (i === 20 || i === 40) {
        await page.screenshot({ path: `/tmp/resolution-progress-${i}.png`, fullPage: true });
      }
    }

    if (!timerReachedZero) {
      console.log('\nTimer did not reach 0 within timeout');
    }

    // Final state capture
    console.log('\n=== FINAL STATE ===');

    // Get final bot stats
    const botNames = ['Lucky7', 'Field', 'Random', 'Doubles', 'Diversified'];
    for (const name of botNames) {
      const row = await page.locator(`text=${name}`).first();
      if (await row.isVisible().catch(() => false)) {
        const parent = row.locator('..').locator('..');
        const text = await parent.textContent().catch(() => '');
        console.log(`   ${text.replace(/\\s+/g, ' ').trim().slice(0, 80)}`);
      }
    }

    // Get total PnL
    const totalPnl = await page.locator('text=/Total PnL/').locator('..').textContent().catch(() => 'N/A');
    console.log(`\n   ${totalPnl}`);

    await page.screenshot({ path: '/tmp/resolution-3-final.png', fullPage: true });

    console.log('\n=================================================');
    console.log('Test Complete!');
    console.log('Screenshots: /tmp/resolution-*.png');
    console.log('=================================================');

  } catch (error) {
    console.error('\nTest Error:', error.message);
    await page.screenshot({ path: '/tmp/resolution-error.png', fullPage: true });
  } finally {
    await page.waitForTimeout(5000);
    await browser.close();
  }
})();
