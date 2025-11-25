"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSimulationStore, BONUS_BET_PAYOUTS } from "@/store/simulationStore";
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
  Sparkles,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Unique sums for bonus bet (2-6, 8-12, excluding 7)
const ALL_BONUS_SUMS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12];

export function BotLeaderboard() {
  const [mounted, setMounted] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const { round, board, refetch: refetchBoard } = useBoard();
  const lastResolvedRoundRef = useRef<bigint | null>(null);

  const {
    bots,
    epoch,
    isRunning,
    isLoading,
    currentRound,
    totalEpochs,
    lastWinningSquare,
    lastDiceRoll,
    startEpoch,
    recordRoundResult,
    resetBots,
    setOnChainState,
  } = useSimulationStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync with on-chain state
  useEffect(() => {
    if (round && board) {
      setOnChainState(Number(round.expiresAt), Number(board.currentSlot));
    }
  }, [round, board, setOnChainState]);

  // Watch for round resolution from on-chain
  useEffect(() => {
    if (!round || !board || !isRunning) return;

    // Check if this round has an on-chain winning square
    if (
      round.winningSquare !== null &&
      lastResolvedRoundRef.current !== round.id
    ) {
      console.log(`Round ${round.id} resolved on-chain! Winning square: ${round.winningSquare}`);
      lastResolvedRoundRef.current = round.id;
      recordRoundResult(round.winningSquare);

      const die1 = Math.floor(round.winningSquare / 6) + 1;
      const die2 = (round.winningSquare % 6) + 1;
      const sum = die1 + die2;

      if (sum === 7) {
        setTxSuccess(`7 OUT! Epoch ended. Dice: ${die1}-${die2}`);
      } else {
        setTxSuccess(`Dice: ${die1}-${die2} (Sum: ${sum})`);
      }
      setTimeout(() => setTxSuccess(null), 3000);
    }
  }, [round, board, isRunning, recordRoundResult]);

  // Handle starting a new epoch
  const handleStartEpoch = useCallback(async () => {
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
      setTxSuccess("Epoch started!");

      // Refetch board data and reset round ref
      await refetchBoard();
      lastResolvedRoundRef.current = null;

      // Start the epoch simulation
      startEpoch();

      setTimeout(() => setTxSuccess(null), 3000);

    } catch (err) {
      console.error("StartEpoch error:", err);
      setTxError(err instanceof Error ? err.message : "Failed to start epoch");
    } finally {
      setTxLoading(false);
    }
  }, [refetchBoard, startEpoch]);

  // Auto-start next round when current round ends (within same epoch)
  useEffect(() => {
    if (!isRunning || !round) return;

    const checkRoundEnd = async () => {
      // If we're still in an epoch and need a new round
      if (round.winningSquare === null && board) {
        const timeRemaining = Number(round.expiresAt) - Number(board.currentSlot);
        if (timeRemaining < -10) { // Round expired
          console.log("Round expired, simulating local dice roll...");
          const localWinningSquare = Math.floor(Math.random() * 36);
          recordRoundResult(localWinningSquare);

          // If epoch continues, start new on-chain round
          const die1 = Math.floor(localWinningSquare / 6) + 1;
          const die2 = (localWinningSquare % 6) + 1;
          const sum = die1 + die2;

          if (sum !== 7) {
            // Start new round for continuing epoch
            setTimeout(async () => {
              if (useSimulationStore.getState().isRunning) {
                try {
                  await fetch("/api/start-round", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ duration: 150 }),
                  });
                  await refetchBoard();
                  lastResolvedRoundRef.current = null;
                } catch (e) {
                  console.error("Failed to start next round:", e);
                }
              }
            }, 2000);
          }
        }
      }
    };

    const interval = setInterval(checkRoundEnd, 2000);
    return () => clearInterval(interval);
  }, [isRunning, round, board, recordRoundResult, refetchBoard]);

  // Sort bots by CRAP earned
  const sortedBots = [...bots].sort((a, b) => b.crapEarned - a.crapEarned);

  // Totals
  const totalCrapEarned = bots.reduce((acc, bot) => acc + bot.crapEarned, 0);
  const totalRngSpent = bots.reduce(
    (acc, bot) => acc + (bot.initialRngBalance - bot.rngBalance),
    0
  );

  // Epoch stats
  const uniqueSumsArray = Array.from(epoch.uniqueSums);
  const uniqueCount = uniqueSumsArray.length;
  const currentMultiplier = epoch.bonusBetMultiplier;

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
              E#{totalEpochs} R#{epoch.roundsInEpoch}
            </span>
          </CardTitle>
          <div className="flex gap-1">
            <Button
              onClick={handleStartEpoch}
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
                  {isRunning ? "Rolling..." : "Start Epoch"}
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

        {/* Epoch Progress / Bonus Bet Tracker */}
        {isRunning && (
          <div className="bg-secondary/50 rounded p-2 mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Target className="h-3 w-3" />
                Bonus Bet Progress
              </span>
              <span className={cn(
                "font-mono",
                currentMultiplier > 0 ? "text-yellow-500" : "text-muted-foreground"
              )}>
                {currentMultiplier > 0 ? `${currentMultiplier}:1` : "5+ to win"}
              </span>
            </div>

            {/* Unique sums indicator */}
            <div className="flex gap-1 flex-wrap">
              {ALL_BONUS_SUMS.map((sum) => (
                <div
                  key={sum}
                  className={cn(
                    "w-5 h-5 rounded text-[10px] flex items-center justify-center font-mono",
                    epoch.uniqueSums.has(sum)
                      ? "bg-yellow-500/30 text-yellow-500 border border-yellow-500/50"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {sum}
                </div>
              ))}
            </div>

            <div className="text-[10px] text-muted-foreground mt-1">
              {uniqueCount}/10 unique sums ({epoch.roundsInEpoch} rolls)
            </div>
          </div>
        )}

        {/* Bonus Bet Payout Table */}
        {!isRunning && totalEpochs === 0 && (
          <div className="bg-secondary/30 rounded p-2 mb-2 text-[10px]">
            <div className="flex items-center gap-1 mb-1 text-yellow-500">
              <Sparkles className="h-3 w-3" />
              Bonus Bet Payouts
            </div>
            <div className="grid grid-cols-3 gap-1 text-muted-foreground">
              <span>5+ sums: 2:1</span>
              <span>6+ sums: 4:1</span>
              <span>7+ sums: 7:1</span>
              <span>8+ sums: 15:1</span>
              <span>9+ sums: 40:1</span>
              <span>10 sums: 189:1</span>
            </div>
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
                  <span className="font-medium w-16 truncate">{bot.name.replace(" Bot", "")}</span>
                  <span className="text-muted-foreground w-6 text-[10px]">
                    {winRate}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {bot.deployedSquares.length > 0 && (
                    <span className="text-yellow-500 text-[10px]">
                      {bot.deployedSquares.length}sq
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground w-10">
                    {bot.rngBalance.toFixed(0)}R
                  </span>
                  <span
                    className={cn(
                      "font-mono w-12 text-right text-[10px]",
                      bot.crapEarned > 0
                        ? "text-green-500"
                        : "text-muted-foreground"
                    )}
                  >
                    +{bot.crapEarned.toFixed(0)}C
                  </span>
                  {bot.bonusCrapEarned > 0 && (
                    <Sparkles className="h-3 w-3 text-yellow-500" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Last result */}
        {lastDiceRoll && (
          <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Dice5 className="h-3 w-3" />
              Last Roll
            </span>
            <span className={cn(
              "font-mono",
              lastDiceRoll[0] + lastDiceRoll[1] === 7 ? "text-red-500" : "text-yellow-500"
            )}>
              {lastDiceRoll[0]}-{lastDiceRoll[1]} ({lastDiceRoll[0] + lastDiceRoll[1]})
              {lastDiceRoll[0] + lastDiceRoll[1] === 7 && " 7 OUT!"}
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

        {/* Epoch history */}
        {epoch.rollHistory.length > 0 && (
          <div className="mt-2 pt-2 border-t">
            <div className="text-[10px] text-muted-foreground mb-1">Roll History:</div>
            <div className="flex gap-1 flex-wrap">
              {epoch.rollHistory.map((sum, i) => (
                <span
                  key={i}
                  className={cn(
                    "px-1 rounded text-[10px] font-mono",
                    sum === 7 ? "bg-red-500/30 text-red-500" : "bg-muted"
                  )}
                >
                  {sum}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
