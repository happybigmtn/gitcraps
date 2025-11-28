import { test, expect, Page } from "@playwright/test";
import { Keypair, Connection, LAMPORTS_PER_SOL, Transaction, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";

const TARGET_URL = "http://localhost:3000";
const LOCALNET_RPC = "http://127.0.0.1:8899";

// Deterministic test keypair
const TEST_SEED = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
]);
const TEST_KEYPAIR = Keypair.fromSeed(TEST_SEED);
const TEST_PUBLIC_KEY = TEST_KEYPAIR.publicKey.toBase58();

// Bet types to test
const BET_TYPES = {
  LINE: ["Pass Line", "Don't Pass"],
  PLACE: ["4", "5", "6", "8", "9", "10"],
  PROPS: ["Field", "Any 7", "Any Craps", "Yo (11)", "Aces (2)", "12 (Boxcars)"],
  HARDWAYS: ["Hard 4", "Hard 6", "Hard 8", "Hard 10"],
};

/**
 * Inject mock wallet into page for automatic transaction signing
 */
async function injectMockWallet(page: Page) {
  const secretKeyArray = Array.from(TEST_KEYPAIR.secretKey);
  const publicKeyBase58 = TEST_PUBLIC_KEY;

  // Set up signing helper before page loads
  await page.addInitScript(`
    window._mockWalletPublicKey = "${publicKeyBase58}";
    window._mockWalletSecretKey = new Uint8Array([${secretKeyArray.join(",")}]);
    window._mockWalletConnected = false;
    window._transactionQueue = [];

    // Helper to sign messages using tweetnacl
    window._mockWalletSignMessage = async function(message) {
      if (!window._naclLoaded) {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js';
          script.onload = () => {
            window._naclLoaded = true;
            resolve();
          };
          document.head.appendChild(script);
        });
      }
      return window.nacl.sign.detached(
        new Uint8Array(message),
        window._mockWalletSecretKey
      );
    };

    // Mock PublicKey class
    class MockPublicKey {
      constructor(key) {
        this._key = typeof key === 'string' ? key : window._mockWalletPublicKey;
      }
      toBase58() { return this._key || window._mockWalletPublicKey; }
      toString() { return this._key || window._mockWalletPublicKey; }
      toBytes() { return window._mockWalletSecretKey.slice(32, 64); }
      toBuffer() { return Buffer.from(this.toBytes()); }
      equals(other) { return this.toBase58() === other?.toBase58?.(); }
    }

    // Create mock Phantom-like wallet
    const mockWallet = {
      isPhantom: true,
      publicKey: null,
      isConnected: false,

      connect: async (opts) => {
        console.log('[MockWallet] connect() called with opts:', opts);
        mockWallet.isConnected = true;
        mockWallet.publicKey = new MockPublicKey();
        window._mockWalletConnected = true;

        // Dispatch connect event
        window.dispatchEvent(new CustomEvent('wallet-connected'));

        return { publicKey: mockWallet.publicKey };
      },

      disconnect: async () => {
        console.log('[MockWallet] disconnect() called');
        mockWallet.isConnected = false;
        mockWallet.publicKey = null;
        window._mockWalletConnected = false;
      },

      signTransaction: async (transaction) => {
        console.log('[MockWallet] signTransaction() called');
        try {
          // Store for later processing
          window._lastTransaction = transaction;
          window._transactionQueue.push({
            timestamp: Date.now(),
            type: 'signTransaction'
          });

          // Auto-approve: actually sign the transaction
          const message = transaction.serializeMessage();
          const signature = await window._mockWalletSignMessage(message);

          // Add signature
          const sigBuffer = Buffer.from(signature);
          transaction.addSignature(mockWallet.publicKey, sigBuffer);

          console.log('[MockWallet] Transaction signed successfully');
          return transaction;
        } catch (error) {
          console.error('[MockWallet] signTransaction error:', error);
          throw error;
        }
      },

      signAllTransactions: async (transactions) => {
        console.log('[MockWallet] signAllTransactions() called');
        const signed = [];
        for (const tx of transactions) {
          signed.push(await mockWallet.signTransaction(tx));
        }
        return signed;
      },

      signMessage: async (message, display) => {
        console.log('[MockWallet] signMessage() called');
        const signature = await window._mockWalletSignMessage(
          typeof message === 'string' ? new TextEncoder().encode(message) : message
        );
        return { signature: new Uint8Array(signature) };
      },

      signAndSendTransaction: async (transaction, opts) => {
        console.log('[MockWallet] signAndSendTransaction() called');
        const signed = await mockWallet.signTransaction(transaction);
        // Return a mock signature
        return { signature: 'mock-signature-' + Date.now() };
      },

      on: (event, callback) => {
        console.log('[MockWallet] on() called for event:', event);
        window.addEventListener('wallet-' + event, (e) => {
          callback({ publicKey: mockWallet.publicKey });
        });
        return mockWallet;
      },

      off: (event, callback) => {
        console.log('[MockWallet] off() called for event:', event);
        return mockWallet;
      },

      emit: (event, ...args) => {
        console.log('[MockWallet] emit() called for event:', event);
        window.dispatchEvent(new CustomEvent('wallet-' + event, { detail: args }));
      },
    };

    // Inject into window before any other scripts run
    Object.defineProperty(window, 'solana', {
      value: mockWallet,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'phantom', {
      value: { solana: mockWallet },
      writable: true,
      configurable: true,
    });

    console.log('[MockWallet] Injected mock wallet with public key:', window._mockWalletPublicKey);
  `);
}

/**
 * Airdrop SOL to test wallet on localnet
 */
async function airdropToTestWallet() {
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  // Check balance first
  const balance = await connection.getBalance(TEST_KEYPAIR.publicKey);
  console.log(`Test wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);

  if (balance < 2 * LAMPORTS_PER_SOL) {
    console.log("Airdropping 5 SOL to test wallet...");
    const sig = await connection.requestAirdrop(TEST_KEYPAIR.publicKey, 5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
    console.log("Airdrop confirmed");
  }

  return connection;
}

/**
 * Switch to localnet in the UI
 */
async function switchToLocalnet(page: Page) {
  // Look for network selector
  const networkButton = page.locator('[data-testid="network-selector"]').first();
  const hasNetworkSelector = await networkButton.isVisible({ timeout: 3000 }).catch(() => false);

  if (hasNetworkSelector) {
    await networkButton.click();
    await page.waitForTimeout(300);

    const localnetOption = page.locator('text="Localnet"').first();
    if (await localnetOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await localnetOption.click();
      await page.waitForTimeout(500);
      console.log("Switched to Localnet");
    }
  } else {
    // Try clicking on "Devnet" text to find network dropdown
    const devnetText = page.locator('button:has-text("Devnet")').first();
    if (await devnetText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await devnetText.click();
      await page.waitForTimeout(300);

      const localnetOpt = page.locator('text="Localnet"').first();
      if (await localnetOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
        await localnetOpt.click();
        await page.waitForTimeout(500);
        console.log("Switched to Localnet via Devnet button");
      }
    }
  }
}

/**
 * Connect wallet via UI
 */
async function connectWallet(page: Page) {
  // Click connect wallet button
  const connectBtn = page.locator('button:has-text("Connect")').first();
  if (await connectBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await connectBtn.click();
    await page.waitForTimeout(1000);

    // Look for Phantom option in wallet modal
    const phantomOption = page.locator('button:has-text("Phantom"), [data-testid="wallet-phantom"]').first();
    if (await phantomOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await phantomOption.click();
      await page.waitForTimeout(2000);
      console.log("Selected Phantom wallet");
    }
  }

  // Verify connection
  await page.waitForTimeout(1000);
  const truncatedAddress = TEST_PUBLIC_KEY.slice(0, 4);
  const connectedIndicator = page.locator(`text=/${truncatedAddress}/`);
  const isConnected = await connectedIndicator.isVisible({ timeout: 5000 }).catch(() => false);

  console.log(`Wallet connected: ${isConnected}`);
  return isConnected;
}

/**
 * Navigate to Craps tab
 */
async function navigateToCraps(page: Page) {
  const crapsTab = page.locator('button:has-text("Craps")').first();
  if (await crapsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await crapsTab.click();
    await page.waitForTimeout(500);
    console.log("Navigated to Craps tab");
  }
}

/**
 * Set bet amount
 */
async function setBetAmount(page: Page, amount: number) {
  const amountInput = page.locator('input#bet-amount, input[type="number"]').first();
  if (await amountInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await amountInput.fill(String(amount));
    console.log(`Set bet amount to ${amount} SOL`);
  }
}

/**
 * Click a bet button and add to pending bets
 */
async function placeBet(page: Page, betName: string, tabName: string) {
  // First switch to the correct tab
  const tab = page.locator(`button[role="tab"]:has-text("${tabName}")`).first();
  if (await tab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(300);
  }

  // Find and click the bet button
  const betButton = page.locator(`button:has-text("${betName}")`).first();
  if (await betButton.isVisible({ timeout: 3000 }).catch(() => false)) {
    const isDisabled = await betButton.isDisabled();
    if (!isDisabled) {
      await betButton.click();
      await page.waitForTimeout(300);
      console.log(`Added ${betName} bet`);
      return true;
    } else {
      console.log(`${betName} bet is disabled (may not be valid in current game state)`);
      return false;
    }
  }
  console.log(`${betName} bet button not found`);
  return false;
}

/**
 * Submit pending bets
 */
async function submitBets(page: Page) {
  const submitBtn = page.locator('button:has-text("Place")').first();
  if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    const isDisabled = await submitBtn.isDisabled();
    if (!isDisabled) {
      await submitBtn.click();
      console.log("Clicked submit bets button");

      // Wait for transaction to be processed
      await page.waitForTimeout(5000);

      // Check for success toast
      const successToast = page.locator('text=/success|placed/i').first();
      const hasSuccess = await successToast.isVisible({ timeout: 10000 }).catch(() => false);

      return hasSuccess;
    }
  }
  return false;
}

test.describe("Craps Betting E2E Tests", () => {
  test.beforeAll(async () => {
    // Airdrop SOL to test wallet before tests
    try {
      await airdropToTestWallet();
    } catch (error) {
      console.log("Airdrop failed (may not be on localnet):", error);
    }
  });

  test("should display all bet types in UI", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    // Navigate to Craps
    await navigateToCraps(page);
    await page.waitForTimeout(500);

    // Take screenshot of initial state
    await page.screenshot({ path: "/tmp/craps-betting-initial.png", fullPage: true });

    // Check each tab has expected bet buttons

    // Line tab
    await page.locator('button[role="tab"]:has-text("Line")').first().click();
    await page.waitForTimeout(300);
    for (const bet of BET_TYPES.LINE) {
      const betBtn = page.locator(`button:has-text("${bet}")`);
      const isVisible = await betBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Line bet "${bet}": ${isVisible ? "visible" : "not visible"}`);
    }

    // Place tab
    await page.locator('button[role="tab"]:has-text("Place")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/craps-place-tab.png", fullPage: true });
    for (const point of BET_TYPES.PLACE) {
      const betBtn = page.locator(`button:has-text("${point}")`).first();
      const isVisible = await betBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Place bet "${point}": ${isVisible ? "visible" : "not visible"}`);
    }

    // Props tab
    await page.locator('button[role="tab"]:has-text("Props")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/craps-props-tab.png", fullPage: true });
    for (const bet of BET_TYPES.PROPS) {
      const betBtn = page.locator(`button:has-text("${bet}")`).first();
      const isVisible = await betBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Props bet "${bet}": ${isVisible ? "visible" : "not visible"}`);
    }

    // Hardways tab
    await page.locator('button[role="tab"]:has-text("Hard")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/craps-hard-tab.png", fullPage: true });
    for (const bet of BET_TYPES.HARDWAYS) {
      const betBtn = page.locator(`button:has-text("${bet}")`).first();
      const isVisible = await betBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`Hardway bet "${bet}": ${isVisible ? "visible" : "not visible"}`);
    }

    console.log("\n=== Bet Types UI Test Complete ===");
  });

  test("should add bets to pending queue", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await navigateToCraps(page);
    await setBetAmount(page, 0.01);

    // Try adding a Field bet (always available)
    const added = await placeBet(page, "Field", "Props");

    if (added) {
      // Check pending bets section
      const pendingSection = page.locator('text="Pending Bets"').first();
      const hasPending = await pendingSection.isVisible({ timeout: 3000 }).catch(() => false);

      console.log(`Pending bets section visible: ${hasPending}`);

      await page.screenshot({ path: "/tmp/craps-pending-bets.png", fullPage: true });

      // Verify Field bet is in pending list
      const fieldInPending = page.locator('text=/Field/').first();
      const hasFieldPending = await fieldInPending.isVisible({ timeout: 2000 }).catch(() => false);

      expect(hasPending || hasFieldPending).toBeTruthy();
    }
  });

  test("should clear pending bets", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await navigateToCraps(page);
    await setBetAmount(page, 0.01);

    // Add a bet
    await placeBet(page, "Field", "Props");
    await page.waitForTimeout(300);

    // Click clear button
    const clearBtn = page.locator('button:has-text("Clear")').first();
    if (await clearBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await clearBtn.click();
      await page.waitForTimeout(300);

      // Verify pending bets is empty
      const pendingSection = page.locator('text="Pending Bets"');
      const stillHasPending = await pendingSection.isVisible({ timeout: 2000 }).catch(() => false);

      console.log(`Pending bets cleared: ${!stillHasPending}`);
    }
  });

  test("should display game status correctly", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await navigateToCraps(page);

    // Check for game status indicators
    const comeOutBadge = page.locator('text="Come-Out Roll"').first();
    const pointBadge = page.locator('text=/Point: \\d+/').first();
    const epochInfo = page.locator('text=/Epoch #\\d+/').first();
    const notInitialized = page.locator('text="Craps game not initialized"').first();

    const hasComeOut = await comeOutBadge.isVisible({ timeout: 3000 }).catch(() => false);
    const hasPoint = await pointBadge.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEpoch = await epochInfo.isVisible({ timeout: 3000 }).catch(() => false);
    const hasNotInit = await notInitialized.isVisible({ timeout: 3000 }).catch(() => false);

    console.log(`Game status - Come-Out: ${hasComeOut}, Point: ${hasPoint}, Epoch: ${hasEpoch}, Not Init: ${hasNotInit}`);

    // One of these states should be visible
    expect(hasComeOut || hasPoint || hasNotInit).toBeTruthy();

    await page.screenshot({ path: "/tmp/craps-game-status.png", fullPage: true });
  });

  test("should show Settle Bets button", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await navigateToCraps(page);

    // Check for Settle Bets button (renamed from Roll Dice)
    const settleBetsBtn = page.locator('button:has-text("Settle Bets")').first();
    const hasSettleBets = await settleBetsBtn.isVisible({ timeout: 5000 }).catch(() => false);

    console.log(`Settle Bets button visible: ${hasSettleBets}`);
    expect(hasSettleBets).toBeTruthy();

    await page.screenshot({ path: "/tmp/craps-settle-bets.png", fullPage: true });
  });

  test("should add multiple bet types to queue", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await navigateToCraps(page);
    await setBetAmount(page, 0.01);

    const betsAdded: string[] = [];

    // Try adding various bets
    // Props bets (always available)
    if (await placeBet(page, "Field", "Props")) betsAdded.push("Field");
    if (await placeBet(page, "Any 7", "Props")) betsAdded.push("Any 7");
    if (await placeBet(page, "Any Craps", "Props")) betsAdded.push("Any Craps");

    // Place bets
    if (await placeBet(page, "6", "Place")) betsAdded.push("Place 6");
    if (await placeBet(page, "8", "Place")) betsAdded.push("Place 8");

    // Hardways
    if (await placeBet(page, "Hard 6", "Hard")) betsAdded.push("Hard 6");
    if (await placeBet(page, "Hard 8", "Hard")) betsAdded.push("Hard 8");

    console.log(`Bets added to queue: ${betsAdded.join(", ")}`);

    // Check total pending amount
    const totalAmount = page.locator('text=/Total/').first();
    const hasTotalAmount = await totalAmount.isVisible({ timeout: 3000 }).catch(() => false);

    await page.screenshot({ path: "/tmp/craps-multiple-bets.png", fullPage: true });

    expect(betsAdded.length).toBeGreaterThan(0);
  });

  test("comprehensive bet type test", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await navigateToCraps(page);

    // Test all tabs and bet types are accessible
    const results: Record<string, { visible: boolean; enabled: boolean }> = {};

    // Line bets
    await page.locator('button[role="tab"]:has-text("Line")').first().click();
    await page.waitForTimeout(300);

    for (const bet of BET_TYPES.LINE) {
      const btn = page.locator(`button:has-text("${bet}")`).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      const enabled = visible ? !(await btn.isDisabled()) : false;
      results[`Line: ${bet}`] = { visible, enabled };
    }

    // Place bets
    await page.locator('button[role="tab"]:has-text("Place")').first().click();
    await page.waitForTimeout(300);

    for (const point of BET_TYPES.PLACE) {
      const btn = page.locator(`button:has-text("${point}")`).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      const enabled = visible ? !(await btn.isDisabled()) : false;
      results[`Place: ${point}`] = { visible, enabled };
    }

    // Props bets
    await page.locator('button[role="tab"]:has-text("Props")').first().click();
    await page.waitForTimeout(300);

    for (const bet of BET_TYPES.PROPS) {
      const btn = page.locator(`button:has-text("${bet}")`).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      const enabled = visible ? !(await btn.isDisabled()) : false;
      results[`Props: ${bet}`] = { visible, enabled };
    }

    // Hardways bets
    await page.locator('button[role="tab"]:has-text("Hard")').first().click();
    await page.waitForTimeout(300);

    for (const bet of BET_TYPES.HARDWAYS) {
      const btn = page.locator(`button:has-text("${bet}")`).first();
      const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
      const enabled = visible ? !(await btn.isDisabled()) : false;
      results[`Hard: ${bet}`] = { visible, enabled };
    }

    // Log results
    console.log("\n=== Comprehensive Bet Type Results ===");
    for (const [bet, status] of Object.entries(results)) {
      console.log(`${bet}: visible=${status.visible}, enabled=${status.enabled}`);
    }

    // Count visible and enabled bets
    const visibleCount = Object.values(results).filter(r => r.visible).length;
    const enabledCount = Object.values(results).filter(r => r.enabled).length;

    console.log(`\nTotal: ${visibleCount} visible, ${enabledCount} enabled out of ${Object.keys(results).length}`);

    // At least some bets should be visible
    expect(visibleCount).toBeGreaterThan(10);

    await page.screenshot({ path: "/tmp/craps-comprehensive-test.png", fullPage: true });
  });
});

test.describe("Craps Transaction Tests (requires localnet)", () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock wallet
    await injectMockWallet(page);
  });

  test("should connect mock wallet and show address", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    // Check if wallet is auto-detected
    const walletInfo = await page.evaluate(() => {
      return {
        hasSolana: !!window.solana,
        hasPhantom: !!(window as any).phantom,
        publicKey: window._mockWalletPublicKey,
      };
    });

    console.log("Wallet injection status:", walletInfo);

    expect(walletInfo.hasSolana).toBeTruthy();
    expect(walletInfo.hasPhantom).toBeTruthy();

    // Try to connect
    await switchToLocalnet(page);
    const connected = await connectWallet(page);

    await page.screenshot({ path: "/tmp/craps-wallet-connected.png", fullPage: true });

    console.log(`Mock wallet connected: ${connected}`);
  });

  test("should attempt to submit bets with mock wallet", async ({ page }) => {
    test.setTimeout(90000);

    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    await switchToLocalnet(page);
    await connectWallet(page);
    await navigateToCraps(page);

    // Set small bet amount
    await setBetAmount(page, 0.01);

    // Add a Field bet (always available)
    const added = await placeBet(page, "Field", "Props");

    if (added) {
      // Try to submit
      const submitted = await submitBets(page);

      await page.screenshot({ path: "/tmp/craps-submit-attempt.png", fullPage: true });

      // Get console logs
      const logs = await page.evaluate(() => {
        return (window as any)._transactionQueue || [];
      });

      console.log("Transaction queue:", logs);

      // Check for any error toasts
      const errorToast = page.locator('text=/error|failed/i').first();
      const hasError = await errorToast.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasError) {
        const errorText = await errorToast.textContent();
        console.log("Error encountered:", errorText);
      }
    }
  });
});
