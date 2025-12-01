#!/usr/bin/env node
import { chromium } from 'playwright';

// Find Phantom extension path in Chrome/Chromium
const PHANTOM_EXTENSION_ID = 'bfnaelmomeimhlpmgjnjophhpkkoljpa';

async function main() {
  // Launch Chromium with user data directory to access installed extensions
  const userDataDir = process.env.HOME + '/.config/chromium';

  console.log('Launching Chromium with user profile...');
  console.log('User data dir:', userDataDir);

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      // Load the Phantom extension
      `--disable-extensions-except=${userDataDir}/Default/Extensions/${PHANTOM_EXTENSION_ID}`,
      `--load-extension=${userDataDir}/Default/Extensions/${PHANTOM_EXTENSION_ID}`,
    ],
    viewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  await page.goto('http://localhost:3000');

  console.log('Browser launched! Navigate to http://localhost:3000');
  console.log('The browser will stay open. Press Ctrl+C to close.');

  // Keep the script running
  await new Promise(() => {});
}

main().catch(console.error);
