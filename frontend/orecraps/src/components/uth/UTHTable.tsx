"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUTH } from "@/hooks/useUTH";
import { formatUTHCard, getUTHHandRankName, UTHPhase } from "@/lib/program";
import { Spade } from "lucide-react";

// Card color helper
function getCardColor(card: number): "red" | "black" {
  if (card === 255) return "black";
  const suit = Math.floor(card / 13);
  return suit === 0 || suit === 1 ? "red" : "black"; // Hearts/Diamonds are red
}

// Card component
function PlayingCard({ card }: { card: number }) {
  const cardStr = formatUTHCard(card);
  const color = getCardColor(card);

  if (card === 255) {
    // Face down card
    return (
      <div className="w-14 h-20 rounded border-2 border-border bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
        <div className="text-blue-300 text-2xl">♠</div>
      </div>
    );
  }

  return (
    <div className={`w-14 h-20 rounded border-2 ${color === "red" ? "border-red-500 bg-white text-red-600" : "border-gray-800 bg-white text-black"} flex items-center justify-center font-bold text-lg`}>
      {cardStr}
    </div>
  );
}

export function UTHTable() {
  const { game, position, loading } = useUTH();

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Spade className="h-5 w-5" />
            Ultimate Texas Hold'em Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
              <Spade className="relative h-16 w-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {loading ? "Loading..." : "UTH not initialized"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[240px]">
              Connect to a network with an active UTH game to start playing.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const phase = position?.phase ?? UTHPhase.Betting;
  const playerCards = position?.playerCards ?? [255, 255];
  const communityCards = position?.communityCards ?? [255, 255, 255, 255, 255];
  const dealerCards = position?.dealerCards ?? [255, 255];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Spade className="h-5 w-5" />
          Ultimate Texas Hold'em Table
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Dealer Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Dealer</h3>
            <div className="flex gap-2 items-center">
              {dealerCards.map((card, idx) => (
                <PlayingCard key={`dealer-${idx}`} card={card} />
              ))}
              {phase >= UTHPhase.Showdown && position && (
                <div className="ml-4 text-sm">
                  <div className="font-medium">{getUTHHandRankName(position.dealerHandRank)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Community Cards */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Community Cards</h3>
            <div className="flex gap-2">
              {communityCards.map((card, idx) => (
                <PlayingCard key={`community-${idx}`} card={card} />
              ))}
            </div>
          </div>

          {/* Player Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Your Hand</h3>
            <div className="flex gap-2 items-center">
              {playerCards.map((card, idx) => (
                <PlayingCard key={`player-${idx}`} card={card} />
              ))}
              {phase >= UTHPhase.Showdown && position && (
                <div className="ml-4 text-sm">
                  <div className="font-medium">{getUTHHandRankName(position.playerHandRank)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Betting Circles */}
          <div className="grid grid-cols-4 gap-4 pt-4 border-t">
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Ante</div>
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-blue-500 bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                {position && position.ante > 0n ? (
                  <span className="text-sm font-medium">{(Number(position.ante) / 1e9).toFixed(2)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Blind</div>
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-purple-500 bg-purple-50 dark:bg-purple-950 flex items-center justify-center">
                {position && position.blind > 0n ? (
                  <span className="text-sm font-medium">{(Number(position.blind) / 1e9).toFixed(2)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Trips</div>
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-amber-500 bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                {position && position.trips > 0n ? (
                  <span className="text-sm font-medium">{(Number(position.trips) / 1e9).toFixed(2)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">Play</div>
              <div className="w-16 h-16 mx-auto rounded-full border-2 border-green-500 bg-green-50 dark:bg-green-950 flex items-center justify-center">
                {position && position.play > 0n ? (
                  <span className="text-sm font-medium">{(Number(position.play) / 1e9).toFixed(2)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
