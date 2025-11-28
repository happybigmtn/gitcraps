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
  getIndicesForSum,
  diceToSquare,
} from "@/lib/dice";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Grid3X3, X } from "lucide-react";

interface SquareData {
  index: number;
  deployed: bigint;
  minerCount: bigint;
}

interface MiningBoardProps {
  squares?: SquareData[];
  winningSquare?: number | null;
  isRoundActive?: boolean;
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// MSCHF-style mini dice - sharp, technical
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
      className="grid grid-cols-3 gap-[1px] bg-foreground rounded-[2px] p-[2px]"
      style={{ width: size, height: size }}
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-full",
            dots[value]?.includes(i)
              ? "bg-background"
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
  const { selectedSquares, toggleSquare, selectBySum, clearSquares } =
    useGameStore();
  const bots = useSimulationStore((state) => state.bots);
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
      minerCount: 0n,
    }));

  // Calculate max deployed for heatmap with memoization
  // Use BigInt comparison to avoid precision loss
  useMemo(() => {
    const max = boardSquares.reduce((max, s) => s.deployed > max ? s.deployed : max, 0n);
    return max > 0n ? max : 1n;
  }, [boardSquares]);

  // Get selected count per sum
  const getSelectedCountForSum = (sum: number) => {
    const indices = getIndicesForSum(sum);
    return indices.filter((i) => selectedSquares[i]).length;
  };

  const selectedCount = selectedSquares.filter(Boolean).length;

  return (
    <Card className="overflow-hidden border-border/50">
      {/* MSCHF-style header with left accent */}
      <CardHeader className="pb-2 border-l-3 border-l-primary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="font-mono text-sm uppercase tracking-wide flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-primary" />
              OUTCOME MATRIX
            </CardTitle>
            <span className="text-[10px] font-mono text-muted-foreground">
              6x6 = 36
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary">
              {selectedCount}<span className="text-muted-foreground">/36</span>
            </span>
            {selectedCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive snappy"
                onClick={clearSquares}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* MSCHF-style Quick Select - Technical chips */}
        <div className="flex flex-wrap gap-1">
          {DICE_MULTIPLIERS.filter((m) => m.sum >= 2).map((mult) => {
            const count = getSelectedCountForSum(mult.sum);
            const isFullySelected = count === mult.ways;
            const isPartiallySelected = count > 0 && !isFullySelected;

            return (
              <motion.button
                key={mult.sum}
                onClick={() => selectBySum(mult.sum)}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "relative px-2 py-1 rounded font-mono text-[11px] snappy",
                  "border border-border/50",
                  isFullySelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : isPartiallySelected
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/50 hover:bg-secondary hover:border-primary/30"
                )}
              >
                <span className="font-bold">{mult.sum}</span>
                <span className="ml-1 opacity-70 text-[10px]">
                  {mult.multiplier}x
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* 6x6 Grid - MSCHF Technical Grid */}
        <div className="overflow-x-auto -mx-3 px-3">
          <div className="min-w-[320px] max-w-[380px] mx-auto">
            {/* Column headers - Technical labels */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              <div className="aspect-square max-w-[44px] flex items-center justify-center">
                <span className="font-mono text-[9px] text-muted-foreground/50">D2</span>
              </div>
              {[1, 2, 3, 4, 5, 6].map((d2) => (
                <div
                  key={d2}
                  className="aspect-square max-w-[44px] flex items-center justify-center"
                >
                  <MiniDice value={d2} size={14} />
                </div>
              ))}
            </div>

            {/* Grid rows */}
            {[1, 2, 3, 4, 5, 6].map((die1, rowIdx) => (
              <div key={die1} className="grid grid-cols-7 gap-1 mb-1">
                {/* Row label */}
                <div className="aspect-square max-w-[44px] flex items-center justify-center relative">
                  {rowIdx === 0 && (
                    <span className="absolute -left-3 font-mono text-[9px] text-muted-foreground/50 rotate-[-90deg]">
                      D1
                    </span>
                  )}
                  <MiniDice value={die1} size={14} />
                </div>

                {[1, 2, 3, 4, 5, 6].map((die2) => {
                  const index = diceToSquare(die1, die2);
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
                        "relative aspect-square max-w-[44px] rounded snappy",
                        "flex flex-col items-center justify-center",
                        "font-mono text-xs",
                        "border",
                        isSelected
                          ? "border-primary bg-primary/15 border-2"
                          : "border-border/40 bg-secondary/30 hover:bg-secondary/60 hover:border-primary/40",
                        isWinner && "ring-2 ring-[oklch(0.75_0.2_145)]",
                        isFlashing && "animate-pulse ring-4 ring-primary/60 bg-primary/25",
                        !isRoundActive && "opacity-40 cursor-not-allowed"
                      )}
                      whileTap={isRoundActive ? { scale: 0.92 } : {}}
                    >
                      <span className={cn(
                        "font-bold text-sm tabular-nums",
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      )}>
                        {combo.label}
                      </span>
                      <span className={cn(
                        "text-[9px] tabular-nums",
                        isSelected ? "text-primary" : "text-muted-foreground/60"
                      )}>
                        ={combo.sum}
                      </span>

                      {/* Deployed overlay */}
                      {square.deployed > 0n && (
                        <div className="absolute bottom-0.5 text-[8px] text-[oklch(0.7_0.15_220)] font-bold">
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

        {/* MSCHF-style Legend - Technical */}
        <div className="pt-3 border-t border-border/30">
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-muted-foreground/50">PAYOUT CURVE:</span>
            <div className="flex gap-3">
              <span className="text-[oklch(0.75_0.2_145)]">7=6x</span>
              <span className="text-primary">6,8=7.2x</span>
              <span className="text-[oklch(0.7_0.15_55)]">5,9=9x</span>
              <span className="text-[oklch(0.65_0.2_25)]">2-4,10-12=12-36x</span>
            </div>
          </div>
          <p className="text-[8px] text-muted-foreground/40 font-mono mt-1 text-center">
            expected value = 1.0 regardless of selection (provably fair)
          </p>
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
