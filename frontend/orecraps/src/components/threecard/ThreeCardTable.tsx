"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useThreeCard } from "@/hooks/useThreeCard";
import { Spade } from "lucide-react";

const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CARD_SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];

function formatCard(cardValue: number): string {
  if (cardValue === 0 || cardValue === 255) return "??";
  const rank = cardValue % 13;
  const suit = Math.floor(cardValue / 13);
  return `${CARD_RANKS[rank]}${CARD_SUITS[suit]}`;
}

function isRedSuit(cardValue: number): boolean {
  if (cardValue === 0 || cardValue === 255) return false;
  const suit = Math.floor(cardValue / 13);
  return suit === 1 || suit === 2; // hearts or diamonds
}

export function ThreeCardTable() {
  const { game, position, loading } = useThreeCard();

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Spade className="h-5 w-5" />
            Three Card Poker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Spade className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {loading ? "Loading..." : "Three Card Poker not initialized"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Connect to a network with an active Three Card Poker game.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStateName = (state: number) => {
    switch (state) {
      case 0: return "Place Bets";
      case 1: return "Cards Dealt";
      case 2: return "Decided";
      case 3: return "Settled";
      default: return "Unknown";
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Spade className="h-5 w-5" />
          Three Card Poker
          {position && (
            <span className="text-xs text-muted-foreground font-normal ml-auto">
              {getStateName(position.state)}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Dealer Cards */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Dealer</p>
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => {
                const card = position?.dealerCards?.[i] ?? 0;
                const showCard = position && position.state >= 1;
                return (
                  <div
                    key={i}
                    className={`w-14 h-20 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${
                      showCard && isRedSuit(card) ? "text-red-500" : ""
                    } ${showCard ? "bg-card border-border" : "bg-primary/10 border-primary/20"}`}
                  >
                    {showCard ? formatCard(card) : "?"}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Player Cards */}
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Your Hand</p>
            <div className="flex justify-center gap-2">
              {[0, 1, 2].map((i) => {
                const card = position?.playerCards?.[i] ?? 0;
                const showCard = position && position.state >= 1;
                return (
                  <div
                    key={i}
                    className={`w-14 h-20 rounded-lg border-2 flex items-center justify-center text-xl font-bold ${
                      showCard && isRedSuit(card) ? "text-red-500" : ""
                    } ${showCard ? "bg-card border-primary" : "bg-secondary border-secondary"}`}
                  >
                    {showCard ? formatCard(card) : "?"}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Beat the dealer with a better 3-card poker hand. Queen-high or better to qualify.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default ThreeCardTable;
