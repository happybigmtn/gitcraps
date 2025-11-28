import { Keypair, Transaction, VersionedTransaction, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

// Test keypair for automated testing (localnet only!)
// This is a deterministic keypair for test purposes
const TEST_SEED = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
]);

export const TEST_KEYPAIR = Keypair.fromSeed(TEST_SEED);
export const TEST_PUBLIC_KEY = TEST_KEYPAIR.publicKey.toBase58();

/**
 * Mock wallet implementation that auto-signs transactions
 * For use in Playwright tests with localnet
 */
export function createMockWalletScript(keypairSecret: number[]): string {
  return `
    (function() {
      const secretKey = new Uint8Array(${JSON.stringify(keypairSecret)});

      // Import nacl for signing (we'll use the one from @noble/ed25519 if available)
      let signFunction;

      // Simple ed25519 signing using the existing libraries
      function sign(message, secretKey) {
        // The secret key is 64 bytes, first 32 are the seed
        const seed = secretKey.slice(0, 32);
        const publicKey = secretKey.slice(32, 64);

        // We need to use the crypto API or a library
        // For simplicity, we'll use a basic approach that works in browser
        return window._mockWalletSign(message, secretKey);
      }

      // Create mock Phantom-like wallet
      const mockWallet = {
        isPhantom: true,
        publicKey: {
          toBase58: () => window._mockWalletPublicKey,
          toBytes: () => secretKey.slice(32, 64),
          toString: () => window._mockWalletPublicKey,
        },
        isConnected: true,

        connect: async () => {
          console.log('[MockWallet] connect() called');
          return { publicKey: mockWallet.publicKey };
        },

        disconnect: async () => {
          console.log('[MockWallet] disconnect() called');
        },

        signTransaction: async (transaction) => {
          console.log('[MockWallet] signTransaction() called');
          try {
            // Get serialized message
            const message = transaction.serializeMessage();
            // Sign using our helper
            const signature = await window._mockWalletSignMessage(message);
            // Add signature to transaction
            transaction.addSignature(mockWallet.publicKey, Buffer.from(signature));
            return transaction;
          } catch (error) {
            console.error('[MockWallet] signTransaction error:', error);
            throw error;
          }
        },

        signAllTransactions: async (transactions) => {
          console.log('[MockWallet] signAllTransactions() called');
          return Promise.all(transactions.map(tx => mockWallet.signTransaction(tx)));
        },

        signMessage: async (message) => {
          console.log('[MockWallet] signMessage() called');
          const signature = await window._mockWalletSignMessage(message);
          return { signature };
        },

        on: (event, callback) => {
          console.log('[MockWallet] on() called for event:', event);
          if (event === 'connect') {
            setTimeout(() => callback({ publicKey: mockWallet.publicKey }), 100);
          }
          return () => {};
        },

        off: () => {},
      };

      // Inject into window
      window.solana = mockWallet;
      window.phantom = { solana: mockWallet };

      console.log('[MockWallet] Injected mock wallet with public key:', window._mockWalletPublicKey);
    })();
  `;
}

/**
 * Script to set up signing helper functions
 */
export function createSigningHelperScript(publicKeyBase58: string, secretKeyArray: number[]): string {
  return `
    window._mockWalletPublicKey = "${publicKeyBase58}";
    window._mockWalletSecretKey = new Uint8Array(${JSON.stringify(secretKeyArray)});

    // Helper to sign messages using nacl
    window._mockWalletSignMessage = async function(message) {
      // Use SubtleCrypto or tweetnacl if available
      if (window.nacl) {
        return window.nacl.sign.detached(message, window._mockWalletSecretKey);
      }

      // Fallback: import tweetnacl dynamically
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

      return window.nacl.sign.detached(message, window._mockWalletSecretKey);
    };
  `;
}
