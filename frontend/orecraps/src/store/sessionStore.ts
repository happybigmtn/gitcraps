/**
 * Session Key Store - Manages 24-hour delegated transaction sessions
 *
 * This store handles:
 * - Session key generation and storage
 * - Session approval signatures
 * - Session expiry management
 * - Delegated transaction authorization
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

/** Duration of a session in milliseconds (24 hours) */
export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Session approval message format
 * This message is signed by the user's wallet to authorize the session
 */
export interface SessionApprovalMessage {
  /** The user's wallet address */
  wallet: string;
  /** The session public key that will sign on behalf of the user */
  sessionKey: string;
  /** Unix timestamp when the session was created */
  createdAt: number;
  /** Unix timestamp when the session expires */
  expiresAt: number;
  /** Domain for the session (security) */
  domain: string;
  /** Nonce to prevent replay attacks */
  nonce: string;
}

/**
 * Active session data stored in localStorage
 */
export interface SessionData {
  /** The user's wallet address */
  walletAddress: string;
  /** The session keypair's public key (base58) */
  sessionPublicKey: string;
  /** The session keypair's secret key (base58 encoded) */
  sessionSecretKey: string;
  /** Signature from the user's wallet approving this session */
  approvalSignature: string;
  /** The message that was signed (JSON stringified) */
  approvalMessage: string;
  /** Unix timestamp when the session was created */
  createdAt: number;
  /** Unix timestamp when the session expires */
  expiresAt: number;
}

/**
 * Session store state
 */
interface SessionState {
  /** Current active session (null if no session) */
  session: SessionData | null;
  /** Whether a session creation is in progress */
  isCreating: boolean;
  /** Whether a delegated transaction is in progress */
  isDelegating: boolean;
  /** Error message from last operation */
  error: string | null;

  // Actions
  /** Create a new session (requires wallet signing) */
  setSession: (session: SessionData | null) => void;
  /** Clear the current session */
  clearSession: () => void;
  /** Set creating state */
  setIsCreating: (isCreating: boolean) => void;
  /** Set delegating state */
  setIsDelegating: (isDelegating: boolean) => void;
  /** Set error */
  setError: (error: string | null) => void;
  /** Check if current session is valid */
  isSessionValid: () => boolean;
  /** Get remaining session time in milliseconds */
  getRemainingTime: () => number;
  /** Get the session keypair (reconstructs from stored secret) */
  getSessionKeypair: () => Keypair | null;
}

/**
 * Generate a unique nonce for session approval messages
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate a new session keypair
 */
export function generateSessionKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Create the session approval message to be signed
 */
export function createSessionApprovalMessage(
  walletAddress: string,
  sessionPublicKey: string
): SessionApprovalMessage {
  const now = Date.now();
  return {
    wallet: walletAddress,
    sessionKey: sessionPublicKey,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
    domain: typeof window !== "undefined" ? window.location.origin : "localhost",
    nonce: generateNonce(),
  };
}

/**
 * Format the approval message for signing
 * Uses a human-readable format so users can verify what they're signing
 */
export function formatMessageForSigning(message: SessionApprovalMessage): string {
  return [
    "ORE Craps Session Authorization",
    "",
    `Wallet: ${message.wallet}`,
    `Session Key: ${message.sessionKey}`,
    `Domain: ${message.domain}`,
    `Created: ${new Date(message.createdAt).toISOString()}`,
    `Expires: ${new Date(message.expiresAt).toISOString()}`,
    `Nonce: ${message.nonce}`,
    "",
    "By signing this message, you authorize this session key to submit",
    "transactions on your behalf for the next 24 hours. The server will",
    "pay gas fees for these transactions.",
    "",
    "This session can only be used for ORE Craps game operations.",
  ].join("\n");
}

/**
 * Session store with persistence
 */
export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      session: null,
      isCreating: false,
      isDelegating: false,
      error: null,

      setSession: (session) => {
        set({ session, error: null });
      },

      clearSession: () => {
        set({ session: null, error: null });
      },

      setIsCreating: (isCreating) => {
        set({ isCreating });
      },

      setIsDelegating: (isDelegating) => {
        set({ isDelegating });
      },

      setError: (error) => {
        set({ error });
      },

      isSessionValid: () => {
        const { session } = get();
        if (!session) return false;
        return Date.now() < session.expiresAt;
      },

      getRemainingTime: () => {
        const { session } = get();
        if (!session) return 0;
        const remaining = session.expiresAt - Date.now();
        return Math.max(0, remaining);
      },

      getSessionKeypair: () => {
        const { session } = get();
        if (!session) return null;
        try {
          const secretKey = bs58.decode(session.sessionSecretKey);
          return Keypair.fromSecretKey(secretKey);
        } catch {
          return null;
        }
      },
    }),
    {
      name: "ore-craps-session",
      // Only persist session data, not transient state
      partialize: (state) => ({
        session: state.session,
      }),
      // Custom storage to handle SSR
      storage: {
        getItem: (name) => {
          if (typeof window === "undefined") return null;
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            return JSON.parse(str);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          if (typeof window === "undefined") return;
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          if (typeof window === "undefined") return;
          localStorage.removeItem(name);
        },
      },
    }
  )
);

/**
 * Selector for session validity
 */
export const useIsSessionValid = () => useSessionStore((s) => s.isSessionValid());

/**
 * Selector for session
 */
export const useSession = () => useSessionStore((s) => s.session);

/**
 * Selector for remaining time
 */
export const useSessionRemainingTime = () => useSessionStore((s) => s.getRemainingTime());
