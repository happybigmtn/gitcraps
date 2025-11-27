"use client";

import React, { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useGameStore } from "@/store/gameStore";
import { useSimulationStore, computeBotSquareMap } from "@/store/simulationStore";
import { formatSol } from "@/lib/solana";
import {
  ALL_DICE_COMBINATIONS,
  DICE_MULTIPLIERS,
  getSumBgColor,
  getSumColor,
  getIndicesForSum,
} from "@/lib/dice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Grid3X3, Dices } from "lucide-react";

interface SquareData {
  index: number;
  deployed: bigint;
  minerCount: number;
}

interface MiningBoardProps {
  squares?: SquareData[];
  winningSquare?: number | null;
  isRoundActive?: boolean;
}

// Helper for shallow array comparison
function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Mini dice face component
function MiniDice({ value, size = 16 }: { value: number; size?: number }) {
  const dots: Record<number, number[]> = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  return (
    <div
      className="grid grid-cols-3 gap-[1px] bg-white dark:bg-gray-200 rounded-[2px] p-[2px]"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full",
            dots[value]?.includes(i)
              ? "bg-gray-900"
              : "bg-transparent"
          )}
          style={{
            width: size / 4.5,
            height: size / 4.5,
          }}
        />
      ))}
    </div>
  );
}

export const MiningBoard = React.memo(function MiningBoard({
  squares,
  winningSquare = null,
  isRoundActive = true,
}: MiningBoardProps) {
  const { selectedSquares, selectedSum, toggleSquare, selectBySum, clearSquares } =
    useGameStore();
  const bots = useSimulationStore((state) => state.bots);
  const simulationRunning = useSimulationStore((state) => state.isRunning);
  const flashingWinningSquare = useSimulationStore((state) => state.flashingWinningSquare);

  // Compute bot square map with memoization to avoid recalculating on every render
  const botSquareMap = useMemo(() => computeBotSquareMap(bots), [bots]);

  // Track if mounted to avoid SSR hydration issues
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Generate default square data if not provided
  const boardSquares: SquareData[] =
    squares ||
    Array.from({ length: 36 }, (_, i) => ({
      index: i,
      deployed: 0n,
      minerCount: 0,
    }));

  // Calculate max deployed for heatmap with memoization
  const maxDeployed = useMemo(() => {
    return Math.max(...boardSquares.map((s) => Number(s.deployed)), 1);
  }, [boardSquares]);

  const getHeatmapColor = (deployed: bigint) => {
    const ratio = Number(deployed) / maxDeployed;
    if (ratio === 0) return "bg-secondary/50";
    if (ratio < 0.25) return "bg-chart-2/30";
    if (ratio < 0.5) return "bg-chart-2/50";
    if (ratio < 0.75) return "bg-chart-2/70";
    return "bg-chart-2/90";
  };

  // Get selected count per sum
  const getSelectedCountForSum = (sum: number) => {
    const indices = getIndicesForSum(sum);
    return indices.filter((i) => selectedSquares[i]).length;
  };

  const selectedCount = selectedSquares.filter(Boolean).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Dice Selection
          </CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">{selectedCount}/36</span>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={clearSquares}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* Quick Select - Compact row */}
        <div className="flex flex-wrap gap-1.5">
          {DICE_MULTIPLIERS.filter((m) => m.sum >= 2).map((mult) => {
            const count = getSelectedCountForSum(mult.sum);
            const isFullySelected = count === mult.ways;

            return (
              <button
                key={mult.sum}
                onClick={() => selectBySum(mult.sum)}
                className={cn(
                  "relative px-2 py-1 rounded-md text-xs font-medium transition-all",
                  "border border-border/50 hover:border-primary/50",
                  isFullySelected && "bg-primary/10 border-primary/30 text-primary"
                )}
              >
                <span className="font-bold">{mult.sum}</span>
                <span className={cn("ml-1 opacity-60", getSumColor(mult.sum))}>
                  {mult.multiplier}x
                </span>
              </button>
            );
          })}
        </div>

        {/* 6x6 Grid - Responsive sizing */}
        <div className="overflow-x-auto -mx-3 px-3">
          <div className="min-w-[320px] max-w-[380px] mx-auto">
            {/* Column headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              <div className="aspect-square max-w-[44px]" />
              {[1, 2, 3, 4, 5, 6].map((d2) => (
                <div
                  key={d2}
                  className="aspect-square max-w-[44px] flex items-center justify-center"
                >
                  <MiniDice value={d2} size={16} />
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {[1, 2, 3, 4, 5, 6].map((die1) => (
              <div key={die1} className="grid grid-cols-7 gap-1 mb-1">
                <div className="aspect-square max-w-[44px] flex items-center justify-center">
                  <MiniDice value={die1} size={16} />
                </div>

                {[1, 2, 3, 4, 5, 6].map((die2) => {
                  const index = (die1 - 1) * 6 + (die2 - 1);
                  const combo = ALL_DICE_COMBINATIONS[index];
                  const square = boardSquares[index];
                  const isSelected = selectedSquares[index];
                  const isWinner = winningSquare === index;
                  const isFlashing = flashingWinningSquare === index;

                  return (
                    <motion.button
                      key={index}
                      onClick={() => isRoundActive && toggleSquare(index)}
                      disabled={!isRoundActive}
                      className={cn(
                        "relative aspect-square max-w-[44px] rounded-lg transition-all",
                        "flex flex-col items-center justify-center",
                        "font-mono text-xs",
                        "border border-border/30",
                        isSelected
                          ? cn("border-2", getSumBgColor(combo.sum))
                          : "bg-secondary/30 hover:bg-secondary/50",
                        isWinner && "ring-2 ring-primary",
                        isFlashing && "animate-pulse ring-4 ring-yellow-400/60 bg-yellow-400/20",
                        !isRoundActive && "opacity-40 cursor-not-allowed"
                      )}
                      whileTap={isRoundActive ? { scale: 0.92 } : {}}
                    >
                      <span className={cn(
                        "font-bold text-sm",
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {combo.label}
                      </span>
                      <span className={cn(
                        "text-[10px] opacity-70",
                        isSelected && getSumColor(combo.sum)
                      )}>
                        ={combo.sum}
                      </span>

                      {/* Deployed overlay */}
                      {Number(square.deployed) > 0 && (
                        <div className="absolute bottom-0.5 text-[8px] text-primary font-bold">
                          {formatSol(square.deployed)}
                        </div>
                      )}

                      {/* Bot indicators */}
                      {mounted && botSquareMap[index] && botSquareMap[index].length > 0 && (
                        <div className="absolute bottom-0.5 left-0.5 flex gap-[1px]">
                          {botSquareMap[index].slice(0, 2).map((bot) => (
                            <div
                              key={bot.botId}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: bot.color }}
                            />
                          ))}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend - Minimal */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground justify-center pt-1 border-t border-border/30">
          <span className="text-green-500">7 (6x)</span>
          <span className="text-yellow-500">6,8 (7.2x)</span>
          <span className="text-orange-500">4,5,9,10 (9-12x)</span>
          <span className="text-red-400">2,3,11,12 (18-36x)</span>
        </div>
      </CardContent>
    </Card>
  );
}, (prevProps, nextProps) => {
  // Custom comparison to prevent unnecessary re-renders
  return (
    prevProps.winningSquare === nextProps.winningSquare &&
    prevProps.isRoundActive === nextProps.isRoundActive &&
    arraysEqual(prevProps.squares || [], nextProps.squares || [])
  );
});
