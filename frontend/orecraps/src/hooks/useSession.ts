"use client";

/**
 * useSession Hook - Session Key Management for Gasless Transactions
 *
 * This hook provides session key creation, validation, and management.
 * Users sign a message once to authorize a 24-hour session during which
 * the server can submit transactions on their behalf (paying gas fees).
 */

import { useCallback, useEffect, useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { toast } from "sonner";
import {
  useSessionStore,
  SESSION_DURATION_MS,
  createSessionApprovalMessage,
  formatMessageForSigning,
  generateSessionKeypair,
  type SessionData,
  type SessionApprovalMessage,
} from "@/store/sessionStore";

/**
 * Hook result type
 */
interface UseSessionResult {
  /** Current session data (null if no active session) */
  session: SessionData | null;
  /** Whether the current session is valid (not expired) */
  isValid: boolean;
  /** Whether session creation is in progress */
  isCreating: boolean;
  /** Remaining time in the session (milliseconds) */
  remainingTime: number;
  /** Formatted remaining time string (e.g., "23h 45m") */
  remainingTimeFormatted: string;
  /** Create a new session (prompts wallet to sign) */
  createSession: () => Promise<boolean>;
  /** End the current session */
  endSession: () => void;
  /** Error message from last operation */
  error: string | null;
}

/**
 * Format milliseconds as a human-readable time string
 */
function formatRemainingTime(ms: number): string {
  if (ms <= 0) return "Expired";

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * useSession Hook
 *
 * Manages session key lifecycle:
 * - Creates new sessions with wallet signature
 * - Validates session expiry
 * - Provides session keypair for delegated transactions
 *
 * @returns Session state and actions
 *
 * @example
 * ```tsx
 * function SessionButton() {
 *   const { session, isValid, createSession, endSession, remainingTimeFormatted } = useSession();
 *
 *   if (isValid) {
 *     return (
 *       <div>
 *         <span>Session active: {remainingTimeFormatted}</span>
 *         <button onClick={endSession}>End Session</button>
 *       </div>
 *     );
 *   }
 *
 *   return (
 *     <button onClick={createSession}>
 *       Start Gas-Free Session
 *     </button>
 *   );
 * }
 * ```
 */
export function useSession(): UseSessionResult {
  const { publicKey, signMessage, connected } = useWallet();
  const {
    session,
    setSession,
    clearSession,
    isCreating,
    setIsCreating,
    error,
    setError,
    isSessionValid,
    getRemainingTime,
  } = useSessionStore();

  // Track remaining time with periodic updates
  const [remainingTime, setRemainingTime] = useState(0);

  // Update remaining time every second
  useEffect(() => {
    const updateTime = () => {
      setRemainingTime(getRemainingTime());
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [getRemainingTime]);

  // Check if session belongs to current wallet
  const isValid = useMemo(() => {
    if (!session || !publicKey) return false;
    if (session.walletAddress !== publicKey.toBase58()) return false;
    return isSessionValid();
  }, [session, publicKey, isSessionValid]);

  // Clear session if wallet changes
  useEffect(() => {
    if (session && publicKey && session.walletAddress !== publicKey.toBase58()) {
      clearSession();
    }
  }, [session, publicKey, clearSession]);

  // Clear expired sessions on mount
  useEffect(() => {
    if (session && !isSessionValid()) {
      clearSession();
    }
  }, [session, isSessionValid, clearSession]);

  /**
   * Create a new session
   * Generates a session keypair and prompts the user to sign an approval message
   */
  const createSession = useCallback(async (): Promise<boolean> => {
    if (!publicKey || !connected) {
      toast.error("Please connect your wallet first");
      return false;
    }

    if (!signMessage) {
      toast.error("Your wallet does not support message signing");
      return false;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Generate a new session keypair
      const sessionKeypair = generateSessionKeypair();
      const sessionPublicKey = sessionKeypair.publicKey.toBase58();
      const walletAddress = publicKey.toBase58();

      // Create the approval message
      const approvalMessage = createSessionApprovalMessage(walletAddress, sessionPublicKey);
      const messageToSign = formatMessageForSigning(approvalMessage);

      toast.info("Please sign the message in your wallet to authorize the session...");

      // Request wallet signature
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(messageToSign);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bs58.encode(signatureBytes);

      // Create session data
      const sessionData: SessionData = {
        walletAddress,
        sessionPublicKey,
        sessionSecretKey: bs58.encode(sessionKeypair.secretKey),
        approvalSignature: signature,
        approvalMessage: JSON.stringify(approvalMessage),
        createdAt: approvalMessage.createdAt,
        expiresAt: approvalMessage.expiresAt,
      };

      // Store session
      setSession(sessionData);

      toast.success("Session created! Gas-free transactions enabled for 24 hours.");
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create session";

      if (message.includes("User rejected") || message.includes("User declined")) {
        toast.error("Session creation cancelled");
      } else {
        toast.error(`Session creation failed: ${message}`);
      }

      setError(message);
      return false;
    } finally {
      setIsCreating(false);
    }
  }, [publicKey, connected, signMessage, setIsCreating, setError, setSession]);

  /**
   * End the current session
   */
  const endSession = useCallback(() => {
    clearSession();
    toast.info("Session ended");
  }, [clearSession]);

  return {
    session,
    isValid,
    isCreating,
    remainingTime,
    remainingTimeFormatted: formatRemainingTime(remainingTime),
    createSession,
    endSession,
    error,
  };
}

export default useSession;

/**
 * Hook to get just the session keypair for use in transaction submission
 */
export function useSessionKeypair(): Keypair | null {
  const { getSessionKeypair, isSessionValid } = useSessionStore();

  return useMemo(() => {
    if (!isSessionValid()) return null;
    return getSessionKeypair();
  }, [getSessionKeypair, isSessionValid]);
}
