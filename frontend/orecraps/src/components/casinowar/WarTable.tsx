"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWarGame, useWarPosition, useWarGameState } from "@/store/warStore";
import { Swords } from "lucide-react";

const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CARD_SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"]; // spade, heart, diamond, club

function formatCard(cardValue: number): string {
  if (cardValue === 0 || cardValue === 255) return "??";
  const rank = (cardValue - 1) % 13;
  const suit = Math.floor((cardValue - 1) / 13);
  return `${CARD_RANKS[rank]}${CARD_SUITS[suit]}`;
}

export function WarTable() {
  const game = useWarGame();
  const position = useWarPosition();
  const gameState = useWarGameState();

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Casino War
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Swords className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">Casino War not initialized</h3>
            <p className="text-sm text-muted-foreground">
              Connect to a network with an active Casino War game.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStateName = (state: number) => {
    switch (state) {
      case 0: return "Place Bets";
      case 1: return "Cards Dealt - Tie!";
      case 2: return "At War";
      case 3: return "Settled";
      default: return "Unknown";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5" />
          Casino War
          <span className="text-xs text-muted-foreground font-normal ml-auto">
            {getStateName(gameState)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Card Display */}
          <div className="flex justify-center items-center gap-8">
            {/* Player Card */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Your Card</p>
              <div className="w-20 h-28 rounded-lg border-2 border-primary bg-card flex items-center justify-center text-2xl font-bold">
                {position?.playerCard ? formatCard(position.playerCard) : "??"}
              </div>
            </div>

            <div className="text-2xl font-bold text-muted-foreground">VS</div>

            {/* Dealer Card */}
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Dealer Card</p>
              <div className="w-20 h-28 rounded-lg border-2 border-destructive bg-card flex items-center justify-center text-2xl font-bold">
                {position?.dealerCard ? formatCard(position.dealerCard) : "??"}
              </div>
            </div>
          </div>

          {/* War Cards (if in war) */}
          {gameState === 2 && position && (
            <div className="flex justify-center items-center gap-8 pt-4 border-t">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">War Card</p>
                <div className="w-16 h-22 rounded border bg-card flex items-center justify-center text-lg font-bold">
                  {position.playerWarCard ? formatCard(position.playerWarCard) : "??"}
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">War Card</p>
                <div className="w-16 h-22 rounded border bg-card flex items-center justify-center text-lg font-bold">
                  {position.dealerWarCard ? formatCard(position.dealerWarCard) : "??"}
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            Bet on your card being higher than the dealer&apos;s. Tie? Go to war or surrender!
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default WarTable;
