"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRoulette } from "@/hooks/useRoulette";
import { getRouletteColor, getRouletteNumberName } from "@/lib/program";
import { ONE_ROUL } from "@/lib/solana";
import { Circle, TrendingUp, Wallet } from "lucide-react";

export function RouletteGameStatus() {
  const {
    game,
    position,
    epochId,
    houseBankroll,
    lastResult,
    pendingWinnings,
    wheelType,
    loading,
  } = useRoulette();

  const houseBankrollRoul = Number(houseBankroll) / Number(ONE_ROUL);
  const pendingWinningsRoul = Number(pendingWinnings) / Number(ONE_ROUL);
  const lastResultColor = lastResult !== 255 ? getRouletteColor(lastResult) : null;
  const lastResultName = lastResult !== 255 ? getRouletteNumberName(lastResult) : "-";
  const wheelTypeName = wheelType === 0 ? "European" : "American";

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Circle className="h-4 w-4" />
            Game Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            {loading ? "Loading..." : "Roulette game not initialized"}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4" />
            Game Status
          </div>
          <Badge variant="outline">{wheelTypeName} Wheel</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last Result */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Last Result</span>
          <div className="flex items-center gap-2">
            {lastResultColor && (
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                  lastResultColor === "red"
                    ? "bg-red-600"
                    : lastResultColor === "black"
                    ? "bg-gray-800"
                    : "bg-green-600"
                }`}
              >
                {lastResultName}
              </div>
            )}
            {!lastResultColor && (
              <span className="text-2xl font-bold">-</span>
            )}
          </div>
        </div>

        {/* Epoch ID */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Epoch</span>
          <span className="font-mono text-sm">#{epochId.toString()}</span>
        </div>

        {/* House Bankroll */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            House Bankroll
          </div>
          <span className="font-mono text-sm">{houseBankrollRoul.toFixed(2)} ROUL</span>
        </div>

        {/* Player Pending Winnings */}
        {pendingWinningsRoul > 0 && (
          <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Wallet className="h-4 w-4" />
              Pending Winnings
            </div>
            <span className="font-mono text-sm font-bold text-green-600">
              {pendingWinningsRoul.toFixed(4)} ROUL
            </span>
          </div>
        )}

        {/* Player Position Stats */}
        {position && (
          <div className="pt-2 border-t space-y-2">
            <div className="text-xs text-muted-foreground">Your Stats (This Epoch)</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wagered</span>
                <span className="font-mono">
                  {(Number(position.totalWagered) / Number(ONE_ROUL)).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Won</span>
                <span className="font-mono text-green-500">
                  {(Number(position.totalWon) / Number(ONE_ROUL)).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lost</span>
                <span className="font-mono text-red-500">
                  {(Number(position.totalLost) / Number(ONE_ROUL)).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Net</span>
                <span
                  className={`font-mono ${
                    Number(position.totalWon) >= Number(position.totalLost)
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  {(
                    (Number(position.totalWon) - Number(position.totalLost)) /
                    Number(ONE_ROUL)
                  ).toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RouletteGameStatus;
