"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRoulette } from "@/hooks/useRoulette";
import { useRouletteStore } from "@/store/rouletteStore";
import { getRouletteColor, ROULETTE_RED_NUMBERS } from "@/lib/program";
import { Circle } from "lucide-react";

// Standard roulette number layout (3 columns x 12 rows)
const ROULETTE_GRID = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

export function RouletteTable() {
  const { game, lastResult, wheelType, loading } = useRoulette();
  const { addStraightUpBet, betAmount } = useRouletteStore();

  const lastResultColor = lastResult !== 255 ? getRouletteColor(lastResult) : null;

  const handleNumberClick = (num: number) => {
    addStraightUpBet(num, betAmount);
  };

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Circle className="h-5 w-5" />
            Roulette Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
              <Circle className="relative h-16 w-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {loading ? "Loading..." : "Roulette not initialized"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[240px]">
              Connect to a network with an active roulette game to start playing.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Circle className="h-5 w-5" />
          Roulette Table
          <span className="text-xs text-muted-foreground font-normal ml-auto">
            {wheelType === 0 ? "European" : "American"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Last Result Display */}
          {lastResultColor && (
            <div className="flex items-center justify-center gap-2 py-2">
              <span className="text-sm text-muted-foreground">Last:</span>
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${
                  lastResultColor === "red"
                    ? "bg-red-600"
                    : lastResultColor === "black"
                    ? "bg-gray-800"
                    : "bg-green-600"
                }`}
              >
                {lastResult === 37 ? "00" : lastResult}
              </div>
            </div>
          )}

          {/* Roulette Grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Zero row */}
              <div className="flex mb-1">
                <button
                  onClick={() => handleNumberClick(0)}
                  className="w-12 h-12 rounded bg-green-600 hover:bg-green-500 text-white font-bold flex items-center justify-center transition-colors"
                >
                  0
                </button>
                {wheelType === 1 && (
                  <button
                    onClick={() => handleNumberClick(37)}
                    className="w-12 h-12 rounded bg-green-600 hover:bg-green-500 text-white font-bold flex items-center justify-center transition-colors ml-1"
                  >
                    00
                  </button>
                )}
              </div>

              {/* Main grid */}
              <div className="flex flex-col gap-1">
                {ROULETTE_GRID.map((row, rowIdx) => (
                  <div key={rowIdx} className="flex gap-1">
                    {row.map((num) => {
                      const isRed = ROULETTE_RED_NUMBERS.includes(num);
                      return (
                        <button
                          key={num}
                          onClick={() => handleNumberClick(num)}
                          className={`w-12 h-10 rounded font-bold text-white flex items-center justify-center transition-colors ${
                            isRed
                              ? "bg-red-600 hover:bg-red-500"
                              : "bg-gray-800 hover:bg-gray-700"
                          } ${
                            lastResult === num
                              ? "ring-2 ring-yellow-400 ring-offset-1"
                              : ""
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                    {/* Column bet button */}
                    <button
                      onClick={() =>
                        useRouletteStore.getState().addColumnBet(2 - rowIdx, betAmount)
                      }
                      className="w-12 h-10 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium flex items-center justify-center transition-colors"
                    >
                      2:1
                    </button>
                  </div>
                ))}
              </div>

              {/* Dozen bets */}
              <div className="flex gap-1 mt-2">
                <button
                  onClick={() =>
                    useRouletteStore.getState().addDozenBet(0, betAmount)
                  }
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  1st 12
                </button>
                <button
                  onClick={() =>
                    useRouletteStore.getState().addDozenBet(1, betAmount)
                  }
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  2nd 12
                </button>
                <button
                  onClick={() =>
                    useRouletteStore.getState().addDozenBet(2, betAmount)
                  }
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  3rd 12
                </button>
              </div>

              {/* Outside bets */}
              <div className="flex gap-1 mt-1">
                <button
                  onClick={() => useRouletteStore.getState().addLowBet(betAmount)}
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  1-18
                </button>
                <button
                  onClick={() => useRouletteStore.getState().addEvenBet(betAmount)}
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  Even
                </button>
                <button
                  onClick={() => useRouletteStore.getState().addRedBet(betAmount)}
                  className="flex-1 h-8 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
                >
                  Red
                </button>
                <button
                  onClick={() => useRouletteStore.getState().addBlackBet(betAmount)}
                  className="flex-1 h-8 rounded bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium transition-colors"
                >
                  Black
                </button>
                <button
                  onClick={() => useRouletteStore.getState().addOddBet(betAmount)}
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  Odd
                </button>
                <button
                  onClick={() => useRouletteStore.getState().addHighBet(betAmount)}
                  className="flex-1 h-8 rounded bg-secondary hover:bg-secondary/80 text-xs font-medium transition-colors"
                >
                  19-36
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Click numbers or outside bets to add to pending bets ({betAmount.toFixed(2)} ROUL each)
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default RouletteTable;
