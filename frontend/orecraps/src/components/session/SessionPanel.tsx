"use client";

/**
 * SessionPanel Component - UI for managing gas-free session keys
 *
 * This component displays session status and allows users to create
 * or end their 24-hour delegated transaction sessions.
 */

import { useSession } from "@/hooks/useSession";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * SessionPanel - Compact session management UI
 *
 * Shows:
 * - Session status (active/inactive)
 * - Remaining time for active sessions
 * - Create/End session buttons
 */
export function SessionPanel() {
  const { connected } = useWallet();
  const {
    isValid,
    isCreating,
    remainingTimeFormatted,
    createSession,
    endSession,
  } = useSession();

  if (!connected) {
    return null;
  }

  if (isValid) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-green-600 dark:text-green-400">Gas-Free</span>
          <span className="text-muted-foreground">({remainingTimeFormatted})</span>
        </span>
        <button
          onClick={endSession}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          End
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={createSession}
      disabled={isCreating}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      {isCreating ? (
        <>
          <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <span>Signing...</span>
        </>
      ) : (
        <>
          <span className="w-2 h-2 rounded-full border border-current" />
          <span>Enable Gas-Free Mode</span>
        </>
      )}
    </button>
  );
}

/**
 * SessionBadge - Minimal session indicator
 *
 * Shows only a small badge when session is active, otherwise nothing.
 * Good for tight UI spaces.
 */
export function SessionBadge() {
  const { connected } = useWallet();
  const { isValid, remainingTimeFormatted } = useSession();

  if (!connected || !isValid) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      Gas-Free
    </span>
  );
}

/**
 * SessionCard - Full session management card
 *
 * Includes explanation of what sessions do and all controls.
 * Good for settings pages or first-time user experience.
 */
export function SessionCard() {
  const { connected } = useWallet();
  const {
    isValid,
    isCreating,
    remainingTimeFormatted,
    createSession,
    endSession,
  } = useSession();

  if (!connected) {
    return (
      <div className="p-4 rounded-lg border bg-card">
        <h3 className="font-medium mb-2">Gas-Free Mode</h3>
        <p className="text-sm text-muted-foreground">
          Connect your wallet to enable gas-free transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium mb-1">Gas-Free Mode</h3>
          {isValid ? (
            <p className="text-sm text-muted-foreground">
              Your session is active. All game transactions are gas-free for the next{" "}
              <span className="text-foreground font-medium">{remainingTimeFormatted}</span>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sign once to enable gas-free transactions for 24 hours.
              The server will pay gas fees for your game actions.
            </p>
          )}
        </div>

        <div className="shrink-0">
          {isValid ? (
            <button
              onClick={endSession}
              className="px-3 py-1.5 text-sm rounded-md border hover:bg-muted transition-colors"
            >
              End Session
            </button>
          ) : (
            <button
              onClick={createSession}
              disabled={isCreating}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isCreating ? "Signing..." : "Enable"}
            </button>
          )}
        </div>
      </div>

      {isValid && (
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-600 dark:text-green-400">Session Active</span>
            <span className="text-muted-foreground">-</span>
            <span className="text-muted-foreground">{remainingTimeFormatted} remaining</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionPanel;
