"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSimulationStore } from "@/store/simulationStore";
import { useBoard } from "@/hooks/useBoard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Bot as BotIcon,
  Play,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Dice5,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function BotLeaderboard() {
  const [mounted, setMounted] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [lastWinningSquare, setLastWinningSquare] = useState<number | null>(null);
  const [roundEndTime, setRoundEndTime] = useState<number | null>(null); // Client-side timer

  const { round, board, refetch: refetchBoard } = useBoard();
  const lastResolvedRoundRef = useRef<bigint | null>(null);

  const {
    bots,
    isRunning,
    isLoading,
    currentRound,
    startSimulation,
    resetBots,
    recordRoundResult,
  } = useSimulationStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Watch for round resolution
  // First check for on-chain resolution (slot_hash set), otherwise use timer-based local simulation
  useEffect(() => {
    if (!round || !board || !isRunning) return;

    // Check if this round has an on-chain winning square
    if (
      round.winningSquare !== null &&
      lastResolvedRoundRef.current !== round.id
    ) {
      console.log(`Round ${round.id} resolved on-chain! Winning square: ${round.winningSquare}`);
      setLastWinningSquare(round.winningSquare);
      lastResolvedRoundRef.current = round.id;

      recordRoundResult(round.winningSquare);

      const die1 = Math.floor(round.winningSquare / 6) + 1;
      const die2 = (round.winningSquare % 6) + 1;
      setTxSuccess(`Dice: ${die1}-${die2} (Square ${round.winningSquare})`);
      setTimeout(() => setTxSuccess(null), 5000);
      return;
    }

    // Local simulation fallback: use client-side timer
    const checkRoundExpiry = () => {
      if (lastResolvedRoundRef.current === round.id) return;
      if (!roundEndTime) return;

      const now = Date.now();
      const timeRemaining = roundEndTime - now;

      // If past the end time (with 5 second buffer), trigger local resolution
      if (timeRemaining < -5000 && round.winningSquare === null) {
        console.log(`Round ${round.id} client timer expired - generating local dice roll`);

        const localWinningSquare = Math.floor(Math.random() * 36);
        setLastWinningSquare(localWinningSquare);
        lastResolvedRoundRef.current = round.id;
        setRoundEndTime(null); // Clear timer

        recordRoundResult(localWinningSquare);

        const die1 = Math.floor(localWinningSquare / 6) + 1;
        const die2 = (localWinningSquare % 6) + 1;
        setTxSuccess(`Local Roll: ${die1}-${die2} (Sim)`);
        setTimeout(() => setTxSuccess(null), 5000);
      }
    };

    // Check every second
    const interval = setInterval(checkRoundExpiry, 1000);
    return () => clearInterval(interval);
  }, [round, board, isRunning, recordRoundResult, roundEndTime]);

  // Handle starting a new round via API (uses admin CLI)
  const handleStartRound = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      const duration = 150; // 150 slots = ~1 minute per round

      console.log("Calling start-round API...");
      const response = await fetch("/api/start-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.details || "Failed to start round");
      }

      console.log("Round started:", data);
      setTxSuccess(data.signature ? `Tx: ${data.signature.slice(0, 8)}...` : "Round started!");

      // Refetch board data
      await refetchBoard();

      // Reset the resolved round ref so we can resolve the new round
      lastResolvedRoundRef.current = null;

      // Start local simulation (bots place their bets)
      startSimulation();

      // Set client-side round end timer (150 slots * 400ms = 60 seconds)
      const durationMs = 150 * 400; // 60 seconds
      setRoundEndTime(Date.now() + durationMs);

      // Clear success message after 5 seconds
      setTimeout(() => setTxSuccess(null), 5000);

    } catch (err) {
      console.error("StartRound error:", err);
      setTxError(err instanceof Error ? err.message : "Failed to start round");
    } finally {
      setTxLoading(false);
    }
  }, [refetchBoard, startSimulation]);

  // Sort bots by CRAP earned (best first)
  const sortedBots = [...bots].sort((a, b) => {
    return b.crapEarned - a.crapEarned;
  });

  // Total CRAP earned by all bots
  const totalCrapEarned = bots.reduce((acc, bot) => acc + bot.crapEarned, 0);
  // Total RNG spent (lost) by all bots
  const totalRngSpent = bots.reduce(
    (acc, bot) => acc + (bot.initialRngBalance - bot.rngBalance),
    0
  );

  if (!mounted) {
    return (
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <BotIcon className="h-4 w-4" />
            Bot Leaderboard
            <span className="text-xs text-muted-foreground font-normal">
              R#{currentRound}
            </span>
          </CardTitle>
          <div className="flex gap-1">
            <Button
              onClick={handleStartRound}
              disabled={isRunning || isLoading || txLoading}
              size="sm"
              variant={isRunning ? "secondary" : "default"}
              className="h-7 px-2 text-xs"
            >
              {txLoading || isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Run
                </>
              )}
            </Button>
            <Button
              onClick={resetBots}
              variant="ghost"
              size="sm"
              disabled={isRunning || isLoading || txLoading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0">
        {/* Error display */}
        {txError && (
          <div className="flex items-center gap-1 text-xs text-destructive bg-destructive/10 p-2 rounded mb-2">
            <AlertCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{txError}</span>
          </div>
        )}

        {/* Success display */}
        {txSuccess && (
          <div className="flex items-center gap-1 text-xs text-green-600 bg-green-500/10 p-2 rounded mb-2">
            <CheckCircle className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{txSuccess}</span>
          </div>
        )}

        {/* Leaderboard table */}
        <div className="space-y-1">
          {sortedBots.map((bot, index) => {
            const rngLost = bot.initialRngBalance - bot.rngBalance;
            const winRate =
              bot.roundsPlayed > 0
                ? ((bot.roundsWon / bot.roundsPlayed) * 100).toFixed(0)
                : "0";

            return (
              <div
                key={bot.id}
                className={cn(
                  "flex items-center justify-between py-1 px-2 rounded text-xs",
                  index === 0 && bot.crapEarned > 0 && "bg-green-500/10",
                  index === sortedBots.length - 1 && rngLost > 0 && bot.crapEarned === 0 && "bg-red-500/10"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: bot.color }}
                  />
                  <span className="font-medium w-20 truncate">{bot.name.replace(" Bot", "")}</span>
                  <span className="text-muted-foreground w-8">
                    {winRate}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {bot.deployedSquares.length > 0 && (
                    <span className="text-yellow-500 text-[10px]">
                      {bot.deployedSquares.length}sq
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {bot.rngBalance.toFixed(0)} RNG
                  </span>
                  <span
                    className={cn(
                      "font-mono w-14 text-right",
                      bot.crapEarned > 0
                        ? "text-green-500"
                        : "text-muted-foreground"
                    )}
                  >
                    +{bot.crapEarned.toFixed(0)} CRAP
                  </span>
                  {bot.crapEarned > 0 ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : rngLost > 0 ? (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  ) : (
                    <div className="w-3" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Last result */}
        {lastWinningSquare !== null && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Dice5 className="h-3 w-3" />
              Last Roll
            </span>
            <span className="font-mono text-yellow-500">
              {Math.floor(lastWinningSquare / 6) + 1}-{(lastWinningSquare % 6) + 1}
            </span>
          </div>
        )}

        {/* Total Stats */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs">
          <span className="text-muted-foreground">RNG Spent</span>
          <span className="font-mono text-red-400">
            -{totalRngSpent.toFixed(0)} RNG
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">CRAP Earned</span>
          <span
            className={cn(
              "font-mono font-bold",
              totalCrapEarned > 0
                ? "text-green-500"
                : "text-muted-foreground"
            )}
          >
            +{totalCrapEarned.toFixed(0)} CRAP
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
