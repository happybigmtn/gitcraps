"use client";

import { useTokenBalances, TAB_TO_TOKEN, TOKEN_DISPLAY_NAMES, GameToken } from "@/hooks/useTokenBalances";
import { Loader2, Coins, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWallet } from "@solana/wallet-adapter-react";

interface TokenBalancesProps {
  activeTab: string;
  className?: string;
}

export function TokenBalances({ activeTab, className }: TokenBalancesProps) {
  const { connected } = useWallet();
  const { balances, loading, refetch, getRngBalance, getGameTokenBalance } = useTokenBalances();

  if (!connected) {
    return null;
  }

  const rngBalance = getRngBalance();
  const gameToken = TAB_TO_TOKEN[activeTab];
  const gameBalance = getGameTokenBalance(activeTab);
  const isRngTab = activeTab === "mine";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* RNG Balance - Always shown prominently */}
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-xs",
        "bg-primary/10 border border-primary/30",
        isRngTab && "ring-1 ring-primary/50"
      )}>
        <Coins className="h-3.5 w-3.5 text-primary" />
        <span className="text-primary font-semibold">RNG</span>
        <span className="text-foreground tabular-nums">
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : rngBalance ? (
            rngBalance.formatted
          ) : (
            "0.0000"
          )}
        </span>
      </div>

      {/* Game Token Balance - Show if not on mine tab and token is different from RNG */}
      {!isRngTab && gameToken && (
        <div className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-xs",
          "bg-[oklch(0.7_0.15_220)]/10 border border-[oklch(0.7_0.15_220)]/30",
          "ring-1 ring-[oklch(0.7_0.15_220)]/50"
        )}>
          <Coins className="h-3.5 w-3.5 text-[oklch(0.7_0.15_220)]" />
          <span className="text-[oklch(0.7_0.15_220)] font-semibold">
            {TOKEN_DISPLAY_NAMES[gameToken]}
          </span>
          <span className="text-foreground tabular-nums">
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : gameBalance ? (
              gameBalance.formatted
            ) : (
              "0.0000"
            )}
          </span>
        </div>
      )}

      {/* Refresh button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={refetch}
        disabled={loading}
        className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
        title="Refresh balances"
      >
        <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
      </Button>
    </div>
  );
}

// Compact version for mobile or limited space
export function TokenBalancesCompact({ activeTab, className }: TokenBalancesProps) {
  const { connected } = useWallet();
  const { loading, getRngBalance, getGameTokenBalance } = useTokenBalances();

  if (!connected) {
    return null;
  }

  const rngBalance = getRngBalance();
  const gameToken = TAB_TO_TOKEN[activeTab];
  const gameBalance = getGameTokenBalance(activeTab);
  const isRngTab = activeTab === "mine";

  return (
    <div className={cn("flex items-center gap-1 font-mono text-[10px]", className)}>
      <span className="text-primary font-bold">
        {loading ? "..." : rngBalance ? rngBalance.formatted : "0"} RNG
      </span>
      {!isRngTab && gameToken && (
        <>
          <span className="text-muted-foreground">|</span>
          <span className="text-[oklch(0.7_0.15_220)] font-bold">
            {loading ? "..." : gameBalance ? gameBalance.formatted : "0"} {TOKEN_DISPLAY_NAMES[gameToken]}
          </span>
        </>
      )}
    </div>
  );
}
