"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCraps } from "@/hooks/useCraps";
import {
  POINT_NUMBERS,
  HARDWAY_NUMBERS,
  indexToPoint,
} from "@/lib/program";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Dices, Target, CircleDot, Loader2, AlertCircle } from "lucide-react";

export function CrapsGameStatus() {
  const { game, position, loading, error, isComeOut, currentPoint } = useCraps();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Loading game state...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!game) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Dices className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Craps game not initialized</p>
          <p className="text-xs mt-1">Fund the house to start playing</p>
        </CardContent>
      </Card>
    );
  }

  const formatSOL = (lamports: bigint) =>
    (Number(lamports) / LAMPORTS_PER_SOL).toFixed(4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dices className="h-5 w-5" />
            Game Status
          </div>
          <div className="flex gap-2">
            <Badge variant={isComeOut ? "default" : "secondary"}>
              {isComeOut ? (
                <>
                  <Target className="h-3 w-3 mr-1" />
                  Come-Out
                </>
              ) : (
                <>
                  <CircleDot className="h-3 w-3 mr-1" />
                  Point: {currentPoint}
                </>
              )}
            </Badge>
            <Badge variant="outline">Epoch {game.epochId.toString()}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* House Stats */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-muted-foreground">House Bankroll</div>
            <div className="font-mono font-bold">{formatSOL(game.houseBankroll)} SOL</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Collected</div>
            <div className="font-mono font-bold text-green-500">
              {formatSOL(game.totalCollected)} SOL
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total Payouts</div>
            <div className="font-mono font-bold text-red-500">
              {formatSOL(game.totalPayouts)} SOL
            </div>
          </div>
        </div>

        {/* Player Position */}
        {position && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="text-sm font-semibold">Your Active Bets</div>

              {/* Line Bets */}
              {(position.passLine > 0n || position.dontPass > 0n) && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Line Bets</div>
                  <div className="grid grid-cols-2 gap-2">
                    {position.passLine > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Pass Line</span>
                        <span className="font-mono">{formatSOL(position.passLine)}</span>
                      </div>
                    )}
                    {position.dontPass > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Don't Pass</span>
                        <span className="font-mono">{formatSOL(position.dontPass)}</span>
                      </div>
                    )}
                    {position.passOdds > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Pass Odds</span>
                        <span className="font-mono">{formatSOL(position.passOdds)}</span>
                      </div>
                    )}
                    {position.dontPassOdds > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>DP Odds</span>
                        <span className="font-mono">{formatSOL(position.dontPassOdds)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Place Bets */}
              {position.placeBets.some((b) => b > 0n) && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Place Bets</div>
                  <div className="grid grid-cols-3 gap-2">
                    {position.placeBets.map((bet, idx) => {
                      if (bet === 0n) return null;
                      const point = indexToPoint(idx);
                      return (
                        <div
                          key={idx}
                          className="p-2 bg-secondary/50 rounded text-sm flex justify-between"
                        >
                          <span>Place {point}</span>
                          <span className="font-mono">{formatSOL(bet)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Come Bets */}
              {position.comeBets.some((b) => b > 0n) && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Come Bets</div>
                  <div className="grid grid-cols-3 gap-2">
                    {position.comeBets.map((bet, idx) => {
                      if (bet === 0n) return null;
                      const point = indexToPoint(idx);
                      return (
                        <div
                          key={idx}
                          className="p-2 bg-secondary/50 rounded text-sm flex justify-between"
                        >
                          <span>Come {point}</span>
                          <span className="font-mono">{formatSOL(bet)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Hardways */}
              {position.hardways.some((b) => b > 0n) && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Hardways</div>
                  <div className="grid grid-cols-2 gap-2">
                    {position.hardways.map((bet, idx) => {
                      if (bet === 0n) return null;
                      const hardway = HARDWAY_NUMBERS[idx];
                      return (
                        <div
                          key={idx}
                          className="p-2 bg-secondary/50 rounded text-sm flex justify-between"
                        >
                          <span>Hard {hardway}</span>
                          <span className="font-mono">{formatSOL(bet)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Single-Roll */}
              {(position.fieldBet > 0n ||
                position.anySeven > 0n ||
                position.anyCraps > 0n ||
                position.yoEleven > 0n ||
                position.aces > 0n ||
                position.twelve > 0n) && (
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Single-Roll</div>
                  <div className="grid grid-cols-3 gap-2">
                    {position.fieldBet > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Field</span>
                        <span className="font-mono">{formatSOL(position.fieldBet)}</span>
                      </div>
                    )}
                    {position.anySeven > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Any 7</span>
                        <span className="font-mono">{formatSOL(position.anySeven)}</span>
                      </div>
                    )}
                    {position.anyCraps > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Any Craps</span>
                        <span className="font-mono">{formatSOL(position.anyCraps)}</span>
                      </div>
                    )}
                    {position.yoEleven > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Yo</span>
                        <span className="font-mono">{formatSOL(position.yoEleven)}</span>
                      </div>
                    )}
                    {position.aces > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>Aces</span>
                        <span className="font-mono">{formatSOL(position.aces)}</span>
                      </div>
                    )}
                    {position.twelve > 0n && (
                      <div className="p-2 bg-secondary/50 rounded text-sm flex justify-between">
                        <span>12</span>
                        <span className="font-mono">{formatSOL(position.twelve)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pending Winnings */}
              {position.pendingWinnings > 0n && (
                <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Pending Winnings</span>
                    <span className="font-mono font-bold text-green-500">
                      {formatSOL(position.pendingWinnings)} SOL
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {!position && (
          <div className="text-center text-muted-foreground text-sm py-4">
            No active bets. Place a bet to get started!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
