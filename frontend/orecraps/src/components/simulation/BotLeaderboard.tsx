"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// Development-only debug logging (stripped in production)
const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.log("[BotLeaderboard]", ...args);
  }
};
import { useSimulationStore, BONUS_BET_PAYOUTS } from "@/store/simulationStore";
import { useBoard } from "@/hooks/useBoard";
import { useNetworkStore } from "@/store/networkStore";
import { useAnalyticsStore, EpochResult } from "@/store/analyticsStore";
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
  const [continuousMode, setContinuousMode] = useState(false);
  const [targetEpochs, setTargetEpochs] = useState(10);
  const [pendingAutoStart, setPendingAutoStart] = useState(false);

  const { round, board, refetch: refetchBoard } = useBoard();
  const lastResolvedRoundRef = useRef<bigint | null>(null);

  // Use refs to avoid stale closure issues in callbacks
  const continuousModeRef = useRef(continuousMode);
  const targetEpochsRef = useRef(targetEpochs);
  const txLoadingRef = useRef(txLoading);

  // Keep refs in sync with state
  useEffect(() => {
    continuousModeRef.current = continuousMode;
  }, [continuousMode]);

  useEffect(() => {
    targetEpochsRef.current = targetEpochs;
  }, [targetEpochs]);

  useEffect(() => {
    txLoadingRef.current = txLoading;
  }, [txLoading]);

  // Network and analytics stores
  const { network } = useNetworkStore();
  const { startSession, recordEpoch, endSession, currentSession } = useAnalyticsStore();

  const {
    bots,
    epoch,
    isRunning,
    isLoading,
    currentRound,
    totalEpochs,
    lastWinningSquare,
    lastDiceRoll,
    flashingWinnerBotIds,
    flashingWinningSquare,
    startEpoch,
    recordRoundResult,
    resetBots,
    setOnChainState,
    clearFlash,
  } = useSimulationStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Clear flash animation after 3 seconds
  useEffect(() => {
    if (flashingWinnerBotIds.length > 0 || flashingWinningSquare !== null) {
      const timer = setTimeout(() => {
        clearFlash();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [flashingWinnerBotIds, flashingWinningSquare, clearFlash]);

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
      debug(`Round ${round.id} resolved on-chain! Winning square: ${round.winningSquare}`);
      lastResolvedRoundRef.current = round.id;
      recordRoundResult(round.winningSquare);

      const die1 = Math.floor(round.winningSquare / 6) + 1;
      const die2 = (round.winningSquare % 6) + 1;
      const sum = die1 + die2;

      if (sum === 7) {
        setTxSuccess(`7 OUT! Epoch ended. Dice: ${die1}-${die2}`);

        // Record epoch to analytics
        const currentState = useSimulationStore.getState();
        const epochResult: EpochResult = {
          epochNumber: currentState.totalEpochs,
          rounds: currentState.epoch.roundsInEpoch,
          uniqueSums: Array.from(currentState.epoch.uniqueSums),
          rollHistory: currentState.epoch.rollHistory,
          bonusMultiplier: currentState.epoch.bonusBetMultiplier,
          timestamp: Date.now(),
          totalRngStaked: currentState.bots.reduce((acc, bot) => acc + (bot.initialRngBalance - bot.rngBalance), 0),
          totalCrapEarned: currentState.bots.reduce((acc, bot) => acc + bot.crapEarned, 0),
          totalBonusCrap: currentState.bots.reduce((acc, bot) => acc + bot.bonusCrapEarned, 0),
          winningSquares: [round.winningSquare],
          botResults: currentState.bots.map((bot) => ({
            botId: bot.id,
            name: bot.name,
            rngSpent: bot.initialRngBalance - bot.rngBalance,
            crapEarned: bot.crapEarned,
            bonusCrapEarned: bot.bonusCrapEarned,
            roundsPlayed: bot.roundsPlayed,
            roundsWon: bot.roundsWon,
            strategy: bot.name,
          })),
        };
        recordEpoch(epochResult);

        // Auto-start next epoch if continuous mode is enabled
        // Use refs to get current values, avoiding stale closure issues
        const isContinuousMode = continuousModeRef.current;
        const targetEpochsValue = targetEpochsRef.current;
        const currentNetwork = useNetworkStore.getState().network;

        debug(`[Continuous Mode Check] continuous=${isContinuousMode}, totalEpochs=${currentState.totalEpochs}, target=${targetEpochsValue}`);

        if (isContinuousMode && currentState.totalEpochs < targetEpochsValue) {
          // Faster auto-start on localnet (1s), slower on devnet (5s)
          const autoStartDelay = currentNetwork === "localnet" ? 1000 : 5000;
          debug(`Continuous mode: Will auto-start epoch ${currentState.totalEpochs + 1}/${targetEpochsValue} in ${autoStartDelay / 1000}s...`);
          // Set flag to trigger auto-start after delay
          setTimeout(() => {
            // Double-check conditions before setting pendingAutoStart
            const stillContinuous = continuousModeRef.current;
            const stillUnderTarget = useSimulationStore.getState().totalEpochs < targetEpochsRef.current;
            const notRunning = !useSimulationStore.getState().isRunning;
            const notLoading = !txLoadingRef.current;

            debug(`[Auto-start timeout] stillContinuous=${stillContinuous}, stillUnderTarget=${stillUnderTarget}, notRunning=${notRunning}, notLoading=${notLoading}`);

            if (stillContinuous && stillUnderTarget && notRunning && notLoading) {
              debug("Setting pendingAutoStart=true");
              setPendingAutoStart(true);
            } else {
              debug("Skipping auto-start: conditions no longer met");
            }
          }, autoStartDelay);
        } else if (isContinuousMode && currentState.totalEpochs >= targetEpochsValue) {
          debug(`Continuous mode: Reached target of ${targetEpochsValue} epochs!`);
          setContinuousMode(false);
          setTxSuccess(`Completed ${targetEpochsValue} epochs!`);
        }
      } else {
        setTxSuccess(`Dice: ${die1}-${die2} (Sum: ${sum})`);
      }
      setTimeout(() => setTxSuccess(null), 3000);
    }
  // Note: We use refs for continuousMode and targetEpochs to avoid stale closures
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, board, isRunning, recordRoundResult, recordEpoch]);

  // Handle starting a new epoch
  const handleStartEpoch = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    setTxSuccess(null);

    try {
      const duration = 150; // 150 slots = ~1 minute per round

      debug(`Calling start-round API on ${network}...`);
      const response = await fetch("/api/start-round", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration, network }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.details || "Failed to start round");
      }

      debug("Round started:", data);

      // Start analytics session if not already running
      if (!currentSession) {
        const programId = "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK";
        startSession(network, programId, 1);
      }

      // Handle simulated response - run full epoch simulation locally
      if (data.simulated && data.roll) {
        debug(`Simulated mode: running epoch locally...`);

        // Start the epoch (deploys bets for all bots)
        startEpoch();

        // Process rolls until we get a 7
        let currentRoll = data.roll;
        let rollCount = 0;
        const maxRolls = 100; // Safety limit

        while (currentRoll.sum !== 7 && rollCount < maxRolls) {
          debug(`Simulated roll #${rollCount + 1}: ${currentRoll.die1}-${currentRoll.die2} = ${currentRoll.sum} (square ${currentRoll.square})`);
          recordRoundResult(currentRoll.square);
          setTxSuccess(`Dice: ${currentRoll.die1}-${currentRoll.die2} (Sum: ${currentRoll.sum})`);

          rollCount++;

          // Add small delay for UI updates
          await new Promise(resolve => setTimeout(resolve, 100));

          // Get next roll
          const nextResponse = await fetch("/api/start-round", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ duration, network, simulated: true }),
          });
          const nextData = await nextResponse.json();
          if (nextData.simulated && nextData.roll) {
            currentRoll = nextData.roll;
          } else {
            break;
          }
        }

        // Process final roll (the 7)
        if (currentRoll.sum === 7) {
          debug(`Simulated roll #${rollCount + 1}: ${currentRoll.die1}-${currentRoll.die2} = 7 (7 OUT!)`);
          recordRoundResult(currentRoll.square);
          setTxSuccess(`7 OUT! Epoch ended. Dice: ${currentRoll.die1}-${currentRoll.die2}`);

          // Record epoch to analytics
          const currentState = useSimulationStore.getState();
          const epochResult: EpochResult = {
            epochNumber: currentState.totalEpochs,
            rounds: currentState.epoch.roundsInEpoch,
            uniqueSums: Array.from(currentState.epoch.uniqueSums),
            rollHistory: currentState.epoch.rollHistory,
            bonusMultiplier: currentState.epoch.bonusBetMultiplier,
            timestamp: Date.now(),
            totalRngStaked: currentState.bots.reduce((acc, bot) => acc + (bot.initialRngBalance - bot.rngBalance), 0),
            totalCrapEarned: currentState.bots.reduce((acc, bot) => acc + bot.crapEarned, 0),
            totalBonusCrap: currentState.bots.reduce((acc, bot) => acc + bot.bonusCrapEarned, 0),
            winningSquares: [currentRoll.square],
            botResults: currentState.bots.map((bot) => ({
              botId: bot.id,
              name: bot.name,
              rngSpent: bot.initialRngBalance - bot.rngBalance,
              crapEarned: bot.crapEarned,
              bonusCrapEarned: bot.bonusCrapEarned,
              roundsPlayed: bot.roundsPlayed,
              roundsWon: bot.roundsWon,
              strategy: bot.name,
            })),
          };
          recordEpoch(epochResult);

          // Auto-start next epoch if continuous mode is enabled
          const isContinuousMode = continuousModeRef.current;
          const targetEpochsValue = targetEpochsRef.current;

          debug(`[Simulated Continuous Mode Check] continuous=${isContinuousMode}, totalEpochs=${currentState.totalEpochs}, target=${targetEpochsValue}`);

          if (isContinuousMode && currentState.totalEpochs < targetEpochsValue) {
            debug(`Continuous mode: Auto-starting next epoch in 500ms...`);
            setTimeout(() => {
              setPendingAutoStart(true);
            }, 500);
          } else if (isContinuousMode && currentState.totalEpochs >= targetEpochsValue) {
            debug(`Continuous mode: Reached target of ${targetEpochsValue} epochs!`);
            setContinuousMode(false);
            setTxSuccess(`Completed ${targetEpochsValue} epochs!`);
          }
        }

        setTimeout(() => setTxSuccess(null), 3000);
        return;
      }

      // Non-simulated mode: normal on-chain flow
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
  }, [refetchBoard, startEpoch, network, currentSession, startSession, recordRoundResult, recordEpoch]);

  // Handle pendingAutoStart flag for continuous mode
  // Use a ref for handleStartEpoch to avoid stale closure issues
  const handleStartEpochRef = useRef(handleStartEpoch);
  useEffect(() => {
    handleStartEpochRef.current = handleStartEpoch;
  }, [handleStartEpoch]);

  useEffect(() => {
    debug(`[pendingAutoStart effect] pendingAutoStart=${pendingAutoStart}, isRunning=${isRunning}, txLoading=${txLoading}`);
    if (pendingAutoStart && !isRunning && !txLoading) {
      setPendingAutoStart(false);
      debug("Continuous mode: Auto-starting next epoch...");
      // Use the ref to call the latest version of handleStartEpoch
      handleStartEpochRef.current().catch((err) => {
        console.error("Auto-start epoch failed:", err);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoStart, isRunning, txLoading]);

  // Auto-start next round when current round ends (within same epoch)
  useEffect(() => {
    if (!isRunning || !round) return;

    const checkRoundEnd = async () => {
      // If we're still in an epoch and need a new round
      if (round.winningSquare === null && board) {
        const timeRemaining = Number(round.expiresAt) - Number(board.currentSlot);
        if (timeRemaining < -2) { // Round expired (2 slots grace period)
          debug("Round expired, simulating local dice roll...");
          // Use crypto.getRandomValues() for secure random number generation
          const randomBytes = new Uint32Array(1);
          crypto.getRandomValues(randomBytes);
          const localWinningSquare = randomBytes[0] % 36;
          recordRoundResult(localWinningSquare);

          // If epoch continues, start new on-chain round
          const die1 = Math.floor(localWinningSquare / 6) + 1;
          const die2 = (localWinningSquare % 6) + 1;
          const sum = die1 + die2;

          if (sum !== 7) {
            // Start new round for continuing epoch (with delay to avoid rate limiting)
            // Use shorter delay on localnet since there's no rate limiting
            const currentNetwork = useNetworkStore.getState().network;
            const nextRoundDelay = currentNetwork === "localnet" ? 500 : 3000;
            setTimeout(async () => {
              if (useSimulationStore.getState().isRunning) {
                try {
                  await fetch("/api/start-round", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ duration: 150, network: currentNetwork }),
                  });
                  // Don't call refetchBoard - the hook already polls
                  lastResolvedRoundRef.current = null;
                } catch (e) {
                  console.error("Failed to start next round:", e);
                }
              }
            }, nextRoundDelay);
          }
        }
      }
    };

    // Check faster on localnet (1 second), slower on devnet (10 seconds)
    const checkInterval = network === "localnet" ? 1000 : 10000;
    const interval = setInterval(checkRoundEnd, checkInterval);
    return () => clearInterval(interval);
  }, [isRunning, round, board, recordRoundResult, network]);

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

        {/* Continuous Mode Control */}
        <div className="flex items-center justify-between bg-secondary/30 rounded p-2 mb-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer" htmlFor="continuous-mode">
            <input
              id="continuous-mode"
              type="checkbox"
              checked={continuousMode}
              onChange={(e) => setContinuousMode(e.target.checked)}
              disabled={isRunning}
              className="w-3 h-3 rounded"
            />
            <span className={continuousMode ? "text-primary" : "text-muted-foreground"}>
              Continuous Mode
            </span>
          </label>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">Target:</span>
            <input
              type="number"
              value={targetEpochs}
              onChange={(e) => setTargetEpochs(Math.max(1, parseInt(e.target.value) || 1))}
              disabled={isRunning}
              className="w-10 h-5 text-[10px] text-center bg-background border rounded px-1"
              min={1}
              max={100}
            />
            <span className="text-[10px] text-muted-foreground">epochs</span>
          </div>
        </div>

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
            const netRngChange = bot.rngBalance - bot.initialRngBalance;
            const winRate =
              bot.roundsPlayed > 0
                ? ((bot.roundsWon / bot.roundsPlayed) * 100).toFixed(0)
                : "0";
            const isFlashing = flashingWinnerBotIds.includes(bot.id);

            return (
              <div
                key={bot.id}
                className={cn(
                  "flex items-center justify-between py-1 px-2 rounded text-xs transition-all duration-300",
                  index === 0 && bot.crapEarned > 0 && "bg-green-500/10",
                  index === sortedBots.length - 1 && netRngChange < 0 && bot.crapEarned === 0 && "bg-red-500/10",
                  isFlashing && "animate-pulse bg-yellow-500/30 ring-2 ring-yellow-500/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      isFlashing && "w-3 h-3"
                    )}
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
                  {/* Net RNG Change */}
                  <span
                    className={cn(
                      "font-mono text-[10px] w-12 text-right",
                      netRngChange > 0 ? "text-green-500" : netRngChange < 0 ? "text-red-400" : "text-muted-foreground"
                    )}
                  >
                    {netRngChange >= 0 ? "+" : ""}{netRngChange.toFixed(0)}R
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
                  {isFlashing && (
                    <span className="text-yellow-500 text-[10px] font-bold animate-bounce">WIN!</span>
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
          <span className="text-muted-foreground">Net RNG Change</span>
          <span className={cn(
            "font-mono",
            totalRngSpent > 0 ? "text-red-400" : totalRngSpent < 0 ? "text-green-500" : "text-muted-foreground"
          )}>
            {totalRngSpent <= 0 ? "+" : "-"}{Math.abs(totalRngSpent).toFixed(0)} RNG
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
