"use client";

import { useMemo, useState, useEffect } from "react";
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

export function MiningBoard({
  squares,
  winningSquare = null,
  isRoundActive = true,
}: MiningBoardProps) {
  const { selectedSquares, selectedSum, toggleSquare, selectBySum, clearSquares } =
    useGameStore();
  const bots = useSimulationStore((state) => state.bots);
  const simulationRunning = useSimulationStore((state) => state.isRunning);

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

  // Calculate max deployed for heatmap
  const maxDeployed = Math.max(
    ...boardSquares.map((s) => Number(s.deployed)),
    1
  );

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
    <div className="space-y-4">
      {/* Sum Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Dices className="h-4 w-4" />
            Quick Select by Sum
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Sum buttons */}
          <div className="flex flex-wrap gap-2">
            {DICE_MULTIPLIERS.filter((m) => m.sum >= 2).map((mult) => {
              const count = getSelectedCountForSum(mult.sum);
              const isFullySelected = count === mult.ways;
              const isPartiallySelected = count > 0 && count < mult.ways;

              return (
                <Button
                  key={mult.sum}
                  variant={isFullySelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => selectBySum(mult.sum)}
                  className={cn(
                    "relative min-w-[48px]",
                    isFullySelected && getSumBgColor(mult.sum),
                    isPartiallySelected && "border-primary/50"
                  )}
                >
                  <span className="font-bold">{mult.sum}</span>
                  <span className={cn("ml-1 text-xs", getSumColor(mult.sum))}>
                    {mult.multiplier}x
                  </span>
                  {isPartiallySelected && (
                    <Badge
                      variant="secondary"
                      className="absolute -top-2 -right-2 h-4 min-w-4 p-0 text-[10px] flex items-center justify-center"
                    >
                      {count}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Selection info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {selectedCount} / 36 combinations selected
            </span>
            {selectedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSquares}>
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 6x6 Dice Combination Grid */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Dice Combinations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Column headers (Die 2 values) */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            <div className="aspect-square" /> {/* Empty corner */}
            {[1, 2, 3, 4, 5, 6].map((d2) => (
              <div
                key={d2}
                className="aspect-square flex items-center justify-center"
              >
                <MiniDice value={d2} size={20} />
              </div>
            ))}
          </div>

          {/* Grid with row headers */}
          {[1, 2, 3, 4, 5, 6].map((die1) => (
            <div key={die1} className="grid grid-cols-7 gap-1 mb-1">
              {/* Row header (Die 1 value) */}
              <div className="aspect-square flex items-center justify-center">
                <MiniDice value={die1} size={20} />
              </div>

              {/* Squares for this row */}
              {[1, 2, 3, 4, 5, 6].map((die2) => {
                const index = (die1 - 1) * 6 + (die2 - 1);
                const combo = ALL_DICE_COMBINATIONS[index];
                const square = boardSquares[index];
                const isSelected = selectedSquares[index];
                const isWinner = winningSquare === index;

                return (
                  <motion.button
                    key={index}
                    onClick={() => isRoundActive && toggleSquare(index)}
                    disabled={!isRoundActive}
                    className={cn(
                      "relative aspect-square rounded-lg border-2 transition-all",
                      "flex flex-col items-center justify-center",
                      "text-xs font-mono",
                      getHeatmapColor(square.deployed),
                      isSelected && getSumBgColor(combo.sum),
                      !isSelected && "border-border/50 hover:border-primary/30",
                      isWinner && "border-chart-2 ring-2 ring-chart-2/50",
                      !isRoundActive && "opacity-50 cursor-not-allowed"
                    )}
                    whileHover={isRoundActive ? { scale: 1.08 } : {}}
                    whileTap={isRoundActive ? { scale: 0.95 } : {}}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.01 }}
                  >
                    {/* Dice combination label */}
                    <span
                      className={cn(
                        "text-[11px] font-bold",
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {combo.label}
                    </span>

                    {/* Sum indicator */}
                    <span
                      className={cn(
                        "text-[9px]",
                        isSelected ? getSumColor(combo.sum) : "text-muted-foreground/70"
                      )}
                    >
                      ={combo.sum}
                    </span>

                    {/* Selection indicator */}
                    {isSelected && (
                      <motion.div
                        className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring" }}
                      />
                    )}

                    {/* Winner indicator */}
                    {isWinner && (
                      <motion.div
                        className="absolute inset-0 rounded-lg bg-chart-2/20"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      />
                    )}

                    {/* Deployed amount overlay */}
                    {Number(square.deployed) > 0 && (
                      <div className="absolute bottom-0.5 text-[8px] text-chart-2 font-bold">
                        {formatSol(square.deployed)}
                      </div>
                    )}

                    {/* Bot bet indicators - only show when mounted to avoid SSR issues */}
                    {mounted && botSquareMap[index] && botSquareMap[index].length > 0 && (
                      <div className="absolute bottom-0.5 left-0.5 flex gap-[2px]">
                        {botSquareMap[index].slice(0, 3).map((bot) => (
                          <motion.div
                            key={bot.botId}
                            className="w-2 h-2 rounded-full border border-white/50"
                            style={{ backgroundColor: bot.color }}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500 }}
                            title={bot.name}
                          />
                        ))}
                        {botSquareMap[index].length > 3 && (
                          <div className="w-2 h-2 rounded-full bg-gray-500 text-[6px] flex items-center justify-center text-white">
                            +{botSquareMap[index].length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground justify-center">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500/30 border border-green-500" />
          <span>7 (6x)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-yellow-500/30 border border-yellow-500" />
          <span>6,8 (7.2x)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-orange-500/30 border border-orange-500" />
          <span>4,5,9,10 (9-12x)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-red-500/30 border border-red-500" />
          <span>2,3,11,12 (18-36x)</span>
        </div>
      </div>
    </div>
  );
}
