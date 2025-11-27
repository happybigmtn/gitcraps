"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSimulationStore, Bot } from "@/store/simulationStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bot as BotIcon,
  Play,
  Square,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Strategy display names
const STRATEGY_NAMES: Record<string, string> = {
  lucky7: "Lucky 7",
  field: "Field Bet",
  random: "Random",
  doubles: "Doubles",
  diversified: "Diversified",
};

// Bot card component
function BotCard({ bot }: { bot: Bot }) {
  const pnl = bot.rngBalance - bot.initialRngBalance;
  const pnlPercent = ((pnl / bot.initialRngBalance) * 100).toFixed(1);
  const winRate =
    bot.roundsPlayed > 0
      ? ((bot.roundsWon / bot.roundsPlayed) * 100).toFixed(0)
      : "0";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative"
    >
      <Card
        className="overflow-hidden"
        style={{ borderColor: bot.color, borderWidth: 2 }}
      >
        <CardContent className="p-3">
          {/* Bot header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: bot.color }}
              />
              <span className="font-semibold text-sm">{bot.name}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {STRATEGY_NAMES[bot.strategy]}
            </Badge>
          </div>

          {/* PnL display */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Balance</span>
            <div className="flex items-center gap-1">
              <span className="font-mono font-bold">
                {bot.rngBalance.toFixed(4)} RNG
              </span>
              {pnl !== 0 && (
                <span
                  className={cn(
                    "text-xs flex items-center",
                    pnl > 0 ? "text-green-500" : "text-red-500"
                  )}
                >
                  {pnl > 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {pnl > 0 ? "+" : ""}
                  {pnlPercent}%
                </span>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="text-muted-foreground">Rounds</div>
              <div className="font-mono font-semibold">{bot.roundsPlayed}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Wins</div>
              <div className="font-mono font-semibold">{bot.roundsWon}</div>
            </div>
            <div className="text-center">
              <div className="text-muted-foreground">Win Rate</div>
              <div className="font-mono font-semibold">{winRate}%</div>
            </div>
          </div>

          {/* Active bets indicator */}
          {bot.deployedSquares.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 pt-2 border-t"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Active Bets</span>
                <div className="flex items-center gap-1">
                  <Zap className="h-3 w-3 text-yellow-500" />
                  <span className="font-mono">
                    {bot.deployedSquares.length} squares
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {bot.deployedSquares.slice(0, 8).map((sq) => (
                  <Badge
                    key={sq}
                    variant="secondary"
                    className="text-[10px] px-1 py-0"
                    style={{ backgroundColor: `${bot.color}30` }}
                  >
                    #{sq}
                  </Badge>
                ))}
                {bot.deployedSquares.length > 8 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    +{bot.deployedSquares.length - 8}
                  </Badge>
                )}
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function BotSimulationPanel() {
  const [mounted, setMounted] = useState(false);
  const {
    bots,
    isRunning,
    isLoading,
    currentRound,
    startEpoch,
    resetBots,
    error,
  } = useSimulationStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalPnl = bots.reduce(
    (acc, bot) => acc + (bot.rngBalance - bot.initialRngBalance),
    0
  );

  // Show loading state during SSR/hydration
  if (!mounted) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BotIcon className="h-4 w-4" />
              Bot Simulation
            </CardTitle>
            <Badge variant="outline">Loading...</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BotIcon className="h-4 w-4" />
            Bot Simulation
          </CardTitle>
          <Badge variant="outline">Round #{currentRound}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Control buttons */}
        <div className="flex gap-2">
          <Button
            onClick={startEpoch}
            disabled={isRunning || isLoading}
            className="flex-1"
            variant={isRunning ? "secondary" : "default"}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deploying...
              </>
            ) : isRunning ? (
              <>
                <Square className="mr-2 h-4 w-4" />
                Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Simulation
              </>
            )}
          </Button>
          <Button
            onClick={resetBots}
            variant="outline"
            size="icon"
            disabled={isRunning || isLoading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Error display */}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            {error}
          </div>
        )}

        {/* Total PnL summary */}
        <div className="flex items-center justify-between p-2 bg-secondary/50 rounded-lg">
          <span className="text-sm text-muted-foreground">Total Bot PnL</span>
          <span
            className={cn(
              "font-mono font-bold",
              totalPnl > 0
                ? "text-green-500"
                : totalPnl < 0
                ? "text-red-500"
                : "text-muted-foreground"
            )}
          >
            {totalPnl > 0 ? "+" : ""}
            {totalPnl.toFixed(4)} SOL
          </span>
        </div>

        {/* Bot cards */}
        <div className="space-y-2">
          <AnimatePresence>
            {bots.map((bot) => (
              <BotCard key={bot.id} bot={bot} />
            ))}
          </AnimatePresence>
        </div>

        {/* Legend */}
        <div className="text-xs text-muted-foreground space-y-1">
          <div className="font-semibold">Strategies:</div>
          <div className="grid grid-cols-2 gap-1">
            <div>
              <span className="text-green-500">Lucky 7</span>: Sum of 7 (6x)
            </div>
            <div>
              <span className="text-yellow-500">Field</span>: 2,3,4,9,10,11,12
            </div>
            <div>
              <span className="text-blue-500">Random</span>: Single random
            </div>
            <div>
              <span className="text-orange-500">Doubles</span>: All doubles
            </div>
            <div className="col-span-2">
              <span className="text-purple-500">Diversified</span>: Sums 6,7,8
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
