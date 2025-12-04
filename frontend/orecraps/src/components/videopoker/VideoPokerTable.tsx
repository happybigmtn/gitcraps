"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useVideoPokerGame,
  useVideoPokerPosition,
  useVideoPokerStore,
  useVideoPokerSelectedHolds,
  useVideoPokerIsLoading,
} from "@/store/videoPokerStore";
import { Tv } from "lucide-react";

const CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CARD_SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];

function formatCard(cardValue: number): string {
  if (cardValue === 0 || cardValue === 255) return "??";
  const rank = (cardValue - 1) % 13;
  const suit = Math.floor((cardValue - 1) / 13);
  return `${CARD_RANKS[rank]}${CARD_SUITS[suit]}`;
}

function isRedSuit(cardValue: number): boolean {
  if (cardValue === 0 || cardValue === 255) return false;
  const suit = Math.floor((cardValue - 1) / 13);
  return suit === 1 || suit === 2;
}

export function VideoPokerTable() {
  const game = useVideoPokerGame();
  const position = useVideoPokerPosition();
  const selectedHolds = useVideoPokerSelectedHolds();
  const loading = useVideoPokerIsLoading();
  const { toggleHold } = useVideoPokerStore();

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Tv className="h-5 w-5" />
            Video Poker
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Tv className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {loading ? "Loading..." : "Video Poker not initialized"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Connect to a network with an active Video Poker game.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const canToggleHold = position && position.state === 2; // VP_STATE_DEALT

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Tv className="h-5 w-5" />
          Video Poker - Jacks or Better
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Cards Display */}
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4].map((i) => {
              const card = position?.cards?.[i] ?? 0;
              const isHeld = selectedHolds[i];
              const showCard = position && position.state >= 2; // Dealt or later

              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  {isHeld && (
                    <span className="text-xs font-bold text-primary">HELD</span>
                  )}
                  <button
                    onClick={() => canToggleHold && toggleHold(i)}
                    disabled={!canToggleHold}
                    className={`w-16 h-24 rounded-lg border-2 flex items-center justify-center text-2xl font-bold transition-all ${
                      showCard && isRedSuit(card) ? "text-red-500" : ""
                    } ${
                      showCard
                        ? isHeld
                          ? "bg-primary/20 border-primary"
                          : "bg-card border-border hover:border-primary/50"
                        : "bg-secondary border-secondary"
                    } ${canToggleHold ? "cursor-pointer" : "cursor-default"}`}
                  >
                    {showCard ? formatCard(card) : "?"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Hand Result Display */}
          {position && position.handRank > 0 && (
            <div className="text-center py-2 bg-primary/10 rounded">
              <span className="font-bold text-lg text-primary">
                {getHandName(position.handRank)}
              </span>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            {canToggleHold
              ? "Click cards to hold, then draw"
              : "Place a bet to start playing"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function getHandName(rank: number): string {
  switch (rank) {
    case 1: return "Jacks or Better";
    case 2: return "Two Pair";
    case 3: return "Three of a Kind";
    case 4: return "Straight";
    case 5: return "Flush";
    case 6: return "Full House";
    case 7: return "Four of a Kind";
    case 8: return "Straight Flush";
    case 9: return "ROYAL FLUSH!";
    default: return "";
  }
}

export default VideoPokerTable;
