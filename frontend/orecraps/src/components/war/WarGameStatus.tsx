"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useWar } from "@/hooks/useWar";
import { ONE_WAR } from "@/lib/solana";
import { Swords, TrendingUp, Wallet } from "lucide-react";

// War game states
function getWarStateName(state: number): string {
  switch (state) {
    case 0: return "Ready to Bet";
    case 1: return "Cards Dealt";
    case 2: return "At War";
    case 3: return "Settled";
    default: return "Unknown";
  }
}

// Card name helper (cards are 1-13 for each rank)
function getWarCardName(cardValue: number): string {
  if (cardValue <= 0 || cardValue > 52) return "-";
  const rank = ((cardValue - 1) % 13) + 1;
  const suit = Math.floor((cardValue - 1) / 13);
  const rankNames = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suitNames = ["♠", "♥", "♦", "♣"];
  return `${rankNames[rank]}${suitNames[suit] || ""}`;
}

export function WarGameStatus() {
  const {
    game,
    position,
    epochId,
    houseBankroll,
    pendingWinnings,
    gameState,
    loading,
  } = useWar();

  const houseBankrollWar = Number(houseBankroll) / Number(ONE_WAR);
  const pendingWinningsWar = Number(pendingWinnings) / Number(ONE_WAR);
  const stateName = getWarStateName(gameState);

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Swords className="h-4 w-4" />
            Game Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            {loading ? "Loading..." : "War game not initialized"}
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
            <Swords className="h-4 w-4" />
            Game Status
          </div>
          <Badge variant="outline">{stateName}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Cards (if dealt) */}
        {position && position.playerCard > 0 && position.dealerCard > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Your Card</div>
              <div className="text-lg font-bold">{getWarCardName(position.playerCard)}</div>
            </div>
            <div className="text-center p-3 bg-secondary/50 rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Dealer Card</div>
              <div className="text-lg font-bold">{getWarCardName(position.dealerCard)}</div>
            </div>
          </div>
        )}

        {/* War Cards (if in war state) */}
        {position && position.playerWarCard > 0 && position.dealerWarCard > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="text-xs text-muted-foreground mb-1">Your War Card</div>
              <div className="text-lg font-bold text-primary">{getWarCardName(position.playerWarCard)}</div>
            </div>
            <div className="text-center p-3 bg-primary/10 rounded-lg border border-primary/20">
              <div className="text-xs text-muted-foreground mb-1">Dealer War Card</div>
              <div className="text-lg font-bold text-primary">{getWarCardName(position.dealerWarCard)}</div>
            </div>
          </div>
        )}

        {/* Current Bets (if active) */}
        {position && (position.anteBet > 0n || position.tieBet > 0n || position.warBet > 0n) && (
          <div className="space-y-2 p-3 bg-secondary/30 rounded-lg">
            <div className="text-xs text-muted-foreground mb-2">Active Bets</div>
            {position.anteBet > 0n && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Ante Bet</span>
                <span className="font-mono">{(Number(position.anteBet) / Number(ONE_WAR)).toFixed(4)} WAR</span>
              </div>
            )}
            {position.tieBet > 0n && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tie Bet</span>
                <span className="font-mono">{(Number(position.tieBet) / Number(ONE_WAR)).toFixed(4)} WAR</span>
              </div>
            )}
            {position.warBet > 0n && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">War Bet</span>
                <span className="font-mono font-bold text-primary">
                  {(Number(position.warBet) / Number(ONE_WAR)).toFixed(4)} WAR
                </span>
              </div>
            )}
          </div>
        )}

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
          <span className="font-mono text-sm">{houseBankrollWar.toFixed(2)} WAR</span>
        </div>

        {/* Game Stats */}
        {game && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Wars:</span>
              <span className="font-mono">{game.warsTriggered.toString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Surrenders:</span>
              <span className="font-mono">{game.surrenders.toString()}</span>
            </div>
          </div>
        )}

        {/* Player Pending Winnings */}
        {pendingWinningsWar > 0 && (
          <div className="flex items-center justify-between p-2 bg-green-500/10 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Wallet className="h-4 w-4" />
              Pending Winnings
            </div>
            <span className="font-mono text-sm font-bold text-green-600">
              {pendingWinningsWar.toFixed(4)} WAR
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
                  {(Number(position.totalWagered) / Number(ONE_WAR)).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Won</span>
                <span className="font-mono text-green-500">
                  {(Number(position.totalWon) / Number(ONE_WAR)).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lost</span>
                <span className="font-mono text-red-500">
                  {(Number(position.totalLost) / Number(ONE_WAR)).toFixed(4)}
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
                    Number(ONE_WAR)
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

export default WarGameStatus;
