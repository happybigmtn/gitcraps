const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const NUM_ROUNDS = 5;
const ROUND_DURATION_SECS = 60; // 1 minute per round

(async () => {
  console.log('=================================================');
  console.log('OreCraps Multi-Round Simulation Test');
  console.log(`Running ${NUM_ROUNDS} rounds, ${ROUND_DURATION_SECS}s each`);
  console.log('=================================================\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Track results across rounds
  const roundResults = [];
  let totalRngSpent = 0;
  let totalCrapEarned = 0;

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Round') || text.includes('dice roll') || text.includes('winner')) {
      console.log(`   [Browser]: ${text}`);
    }
  });

  try {
    // Load page
    console.log('Loading page...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    for (let round = 1; round <= NUM_ROUNDS; round++) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`ROUND ${round} OF ${NUM_ROUNDS}`);
      console.log('='.repeat(50));

      // Wait for Run button to be enabled
      console.log('Waiting for Run button to be enabled...');
      const runBtn = await page.locator('button:has-text("Run")').first();

      // Wait up to 30 seconds for button to be enabled
      let buttonEnabled = false;
      for (let i = 0; i < 30; i++) {
        const isDisabled = await runBtn.isDisabled().catch(() => true);
        if (!isDisabled) {
          buttonEnabled = true;
          break;
        }
        await page.waitForTimeout(1000);
        if (i % 5 === 0) console.log(`  Waiting... (${i}s)`);
      }

      if (!buttonEnabled) {
        console.log('Run button still disabled after 30s, forcing click...');
      }

      // Click Run button to start round
      console.log('Starting round...');
      await runBtn.click({ force: true });
      console.log('Run button clicked, waiting for round to start...');

      // Wait for API call to complete
      await page.waitForTimeout(5000);

      // Check for success
      const successMsg = await page.locator('text=Tx:').first();
      if (await successMsg.isVisible().catch(() => false)) {
        const text = await successMsg.textContent();
        console.log(`Round started! ${text}`);
      }

      // Get initial bot states
      const initialBots = await getBotStats(page);
      console.log('\nInitial bot states:');
      for (const bot of initialBots) {
        console.log(`  ${bot.name}: ${bot.rng} RNG, ${bot.crap} CRAP, ${bot.squares} squares`);
      }

      // Monitor timer countdown
      console.log(`\nWaiting for round to complete (~${ROUND_DURATION_SECS}s)...`);

      let timerReachedZero = false;
      const startTime = Date.now();
      const maxWaitTime = (ROUND_DURATION_SECS + 30) * 1000; // Extra 30s buffer

      while (!timerReachedZero && (Date.now() - startTime) < maxWaitTime) {
        await page.waitForTimeout(5000);

        // Get timer text
        let timerText = '??:??';
        try {
          const timerElement = await page.locator('text=/^[0-9]:[0-5][0-9]$/').first();
          if (await timerElement.isVisible()) {
            timerText = await timerElement.textContent();
          }
        } catch (e) {}

        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        console.log(`  [${elapsed}s] Timer: ${timerText}`);

        // Check if timer is at 0:00 and we're past 30 seconds
        if (timerText === '0:00' && elapsed > 30) {
          timerReachedZero = true;
        }
      }

      // Wait for resolution
      console.log('Round ended, waiting for resolution...');
      await page.waitForTimeout(8000);

      // Get final bot states
      const finalBots = await getBotStats(page);
      console.log('\nFinal bot states:');
      for (const bot of finalBots) {
        console.log(`  ${bot.name}: ${bot.rng} RNG, ${bot.crap} CRAP`);
      }

      // Get last roll result
      let lastRoll = 'unknown';
      try {
        const lastRollElement = await page.locator('text=/Last Roll/').locator('..').locator('text=/\\d+-\\d+/').first();
        if (await lastRollElement.isVisible()) {
          lastRoll = await lastRollElement.textContent();
        }
      } catch (e) {}

      console.log(`\nRound ${round} Result: Dice rolled ${lastRoll}`);

      // Calculate round stats
      const roundRngSpent = initialBots.reduce((acc, bot) => {
        const finalBot = finalBots.find(b => b.name === bot.name);
        const spent = parseInt(bot.rng) - (finalBot ? parseInt(finalBot.rng) : 0);
        return acc + Math.max(0, spent);
      }, 0);

      const roundCrapEarned = finalBots.reduce((acc, bot) => {
        const initialBot = initialBots.find(b => b.name === bot.name);
        const earned = parseInt(bot.crap) - (initialBot ? parseInt(initialBot.crap) : 0);
        return acc + Math.max(0, earned);
      }, 0);

      roundResults.push({
        round,
        diceRoll: lastRoll,
        rngSpent: roundRngSpent,
        crapEarned: roundCrapEarned,
      });

      totalRngSpent += roundRngSpent;
      totalCrapEarned += roundCrapEarned;

      // Screenshot
      await page.screenshot({ path: `/tmp/multi-round-${round}.png`, fullPage: true });

      // Wait between rounds (only if not last round)
      if (round < NUM_ROUNDS) {
        console.log('\nWaiting 5 seconds before next round...');
        await page.waitForTimeout(5000);
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(50));
    console.log('SIMULATION COMPLETE');
    console.log('='.repeat(50));
    console.log('\nRound-by-round results:');
    for (const result of roundResults) {
      console.log(`  Round ${result.round}: Dice ${result.diceRoll}, -${result.rngSpent} RNG, +${result.crapEarned} CRAP`);
    }
    console.log('\nTotals:');
    console.log(`  Total RNG Spent: ${totalRngSpent} RNG`);
    console.log(`  Total CRAP Earned: ${totalCrapEarned} CRAP`);

    // Get final leaderboard
    const finalBots = await getBotStats(page);
    console.log('\nFinal Leaderboard:');
    finalBots.sort((a, b) => parseInt(b.crap) - parseInt(a.crap));
    for (let i = 0; i < finalBots.length; i++) {
      console.log(`  ${i + 1}. ${finalBots[i].name}: ${finalBots[i].rng} RNG, ${finalBots[i].crap} CRAP`);
    }

    await page.screenshot({ path: '/tmp/multi-round-final.png', fullPage: true });
    console.log('\nScreenshots saved to /tmp/multi-round-*.png');

  } catch (error) {
    console.error('\nTest Error:', error.message);
    await page.screenshot({ path: '/tmp/multi-round-error.png', fullPage: true });
  } finally {
    await page.waitForTimeout(5000);
    await browser.close();
  }
})();

// Helper function to extract bot stats from the page
async function getBotStats(page) {
  const bots = [];
  const botNames = ['Lucky7', 'Field', 'Random', 'Doubles', 'Diversified'];

  for (const name of botNames) {
    try {
      const row = await page.locator(`text=${name}`).first();
      if (await row.isVisible().catch(() => false)) {
        // Get the parent row and extract RNG and CRAP values
        const parent = row.locator('..').locator('..');
        const text = await parent.textContent().catch(() => '');

        // Extract RNG balance
        const rngMatch = text.match(/(\d+)\s*RNG/);
        const rng = rngMatch ? rngMatch[1] : '0';

        // Extract CRAP earned
        const crapMatch = text.match(/\+(\d+)\s*CRAP/);
        const crap = crapMatch ? crapMatch[1] : '0';

        // Extract squares deployed
        const squaresMatch = text.match(/(\d+)sq/);
        const squares = squaresMatch ? squaresMatch[1] : '0';

        bots.push({ name, rng, crap, squares });
      }
    } catch (e) {
      bots.push({ name, rng: '0', crap: '0', squares: '0' });
    }
  }

  return bots;
}
