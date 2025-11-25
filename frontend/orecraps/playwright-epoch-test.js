const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';

(async () => {
  console.log('=================================================');
  console.log('OreCraps Epoch Simulation Test');
  console.log('Testing continuous betting until 7 is rolled');
  console.log('=================================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Round') || text.includes('dice') || text.includes('Epoch')) {
      console.log(`   [Browser]: ${text}`);
    }
  });

  try {
    console.log('Loading page...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Check for bonus bet payout table
    const bonusPayouts = await page.locator('text=/5\\+ sums: 2:1/').first();
    if (await bonusPayouts.isVisible().catch(() => false)) {
      console.log('Bonus bet payout table visible');
    }

    // Start epoch
    console.log('\nStarting epoch...');
    const startBtn = await page.locator('button:has-text("Start Epoch")').first();
    if (await startBtn.isVisible()) {
      await startBtn.click();
      console.log('Start Epoch clicked');
    }

    await page.waitForTimeout(5000);
    await page.screenshot({ path: '/tmp/epoch-1-started.png', fullPage: true });

    // Monitor the epoch
    console.log('\nMonitoring epoch (will run until 7 is rolled)...');
    console.log('Expected ~6 rolls on average before 7\n');

    let epochEnded = false;
    let rollCount = 0;
    let uniqueSums = new Set();

    for (let i = 0; i < 60 && !epochEnded; i++) { // Max 60 iterations (~10 minutes)
      await page.waitForTimeout(10000); // Check every 10 seconds

      // Get roll history
      const rollHistory = await page.locator('.flex.gap-1.flex-wrap .font-mono').allTextContents();
      const currentRollCount = rollHistory.length;

      if (currentRollCount > rollCount) {
        rollCount = currentRollCount;
        console.log(`[${i * 10}s] Rolls: ${rollHistory.join(', ')}`);

        // Check for 7 OUT
        if (rollHistory.includes('7')) {
          console.log('\n7 OUT! Epoch ended!');
          epochEnded = true;
        }

        // Check unique sums
        rollHistory.forEach(r => {
          const sum = parseInt(r);
          if (sum !== 7 && !isNaN(sum)) {
            uniqueSums.add(sum);
          }
        });

        console.log(`   Unique sums: ${Array.from(uniqueSums).sort((a,b) => a-b).join(', ')} (${uniqueSums.size}/10)`);
      }

      // Check if button changed back to "Start Epoch"
      const isRunning = await page.locator('button:has-text("Rolling...")').isVisible().catch(() => false);
      if (!isRunning && rollCount > 0) {
        console.log('\nSimulation stopped (button shows Start Epoch)');
        epochEnded = true;
      }
    }

    await page.screenshot({ path: '/tmp/epoch-2-ended.png', fullPage: true });

    // Get final stats
    console.log('\n=== EPOCH RESULTS ===');

    // Get bot stats
    const botNames = ['Lucky7', 'Field', 'Random', 'Doubles', 'Diversified'];
    for (const name of botNames) {
      const row = await page.locator(`text=${name}`).first();
      if (await row.isVisible().catch(() => false)) {
        const parent = row.locator('..').locator('..');
        const text = await parent.textContent().catch(() => '');
        console.log(`   ${text.replace(/\s+/g, ' ').trim().slice(0, 80)}`);
      }
    }

    // Get totals
    const rngSpent = await page.locator('text=/RNG Spent/').locator('..').textContent().catch(() => '');
    const crapEarned = await page.locator('text=/CRAP Earned/').locator('..').textContent().catch(() => '');
    console.log(`\n   ${rngSpent.replace(/\s+/g, ' ').trim()}`);
    console.log(`   ${crapEarned.replace(/\s+/g, ' ').trim()}`);

    console.log(`\n   Total rolls in epoch: ${rollCount}`);
    console.log(`   Unique sums collected: ${uniqueSums.size}/10`);

    // Check bonus payout
    const bonusMultiplier = uniqueSums.size >= 10 ? 189 :
                           uniqueSums.size >= 9 ? 40 :
                           uniqueSums.size >= 8 ? 15 :
                           uniqueSums.size >= 7 ? 7 :
                           uniqueSums.size >= 6 ? 4 :
                           uniqueSums.size >= 5 ? 2 : 0;
    console.log(`   Bonus multiplier: ${bonusMultiplier}:1`);

    await page.screenshot({ path: '/tmp/epoch-3-final.png', fullPage: true });

    console.log('\n=================================================');
    console.log('Test Complete!');
    console.log('Screenshots: /tmp/epoch-*.png');
    console.log('=================================================');

  } catch (error) {
    console.error('\nTest Error:', error.message);
    await page.screenshot({ path: '/tmp/epoch-error.png', fullPage: true });
  } finally {
    await page.waitForTimeout(3000);
    await browser.close();
  }
})();
