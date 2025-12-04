"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWar } from "@/hooks/useWar";
import { Swords } from "lucide-react";

// War game state constants
const WAR_STATE_DEALT = 1;
const WAR_STATE_WAR = 2;
const WAR_STATE_SETTLED = 3;

// Card helper functions
function getWarCardRank(cardValue: number): string {
  if (cardValue <= 0 || cardValue > 52) return "?";
  const rank = ((cardValue - 1) % 13) + 1;
  const rankNames = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  return rankNames[rank] || "?";
}

function getWarCardSuit(cardValue: number): string {
  if (cardValue <= 0 || cardValue > 52) return "";
  const suit = Math.floor((cardValue - 1) / 13);
  const suitNames = ["♠", "♥", "♦", "♣"];
  return suitNames[suit] || "";
}

// Card component for displaying individual cards
function PlayingCard({ card, label }: { card: number; label: string }) {
  const rank = getWarCardRank(card);
  const suit = getWarCardSuit(card);
  const isHidden = card === 0 || card === 255;
  const isRed = suit === "♥" || suit === "♦";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div
        className={`w-24 h-32 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
          isHidden
            ? "bg-gradient-to-br from-blue-900 to-blue-700 border-blue-600"
            : "bg-white border-gray-300 shadow-lg"
        }`}
      >
        {isHidden ? (
          <div className="text-4xl text-blue-100/30">?</div>
        ) : (
          <>
            <div
              className={`text-5xl font-bold ${
                isRed ? "text-red-600" : "text-gray-800"
              }`}
            >
              {rank}
            </div>
            <div
              className={`text-3xl mt-1 ${
                isRed ? "text-red-600" : "text-gray-800"
              }`}
            >
              {suit}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function WarTable() {
  const { game, position, loading } = useWar();

  if (!game) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Swords className="h-5 w-5" />
            Casino War Table
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
              <Swords className="relative h-16 w-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {loading ? "Loading..." : "Casino War not initialized"}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[240px]">
              Connect to a network with an active war game to start playing.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasActiveGame = position && position.state !== 0 && position.state !== 3;
  const showCards = position && (position.state === WAR_STATE_DEALT || position.state === WAR_STATE_WAR || position.state === WAR_STATE_SETTLED);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5" />
          Casino War Table
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Table felt area */}
          <div className="bg-gradient-to-br from-green-700 to-green-900 rounded-lg p-8 min-h-[300px] flex items-center justify-center">
            {!hasActiveGame ? (
              <div className="text-center">
                <p className="text-white/60 text-sm mb-2">Place your bet to start</p>
                <p className="text-white/40 text-xs">
                  Cards will appear here once you deal
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-8">
                {/* Dealer's Card */}
                {showCards && (
                  <>
                    <div className="flex flex-col items-center gap-4">
                      <PlayingCard card={position.dealerCard} label="Dealer" />
                      {position.state === WAR_STATE_WAR && position.dealerWarCard > 0 && (
                        <PlayingCard card={position.dealerWarCard} label="War Card" />
                      )}
                    </div>

                    {/* VS indicator */}
                    <div className="flex items-center justify-center">
                      <Swords className="h-8 w-8 text-yellow-400" />
                    </div>

                    {/* Player's Card */}
                    <div className="flex flex-col items-center gap-4">
                      <PlayingCard card={position.playerCard} label="Player" />
                      {position.state === WAR_STATE_WAR && position.playerWarCard > 0 && (
                        <PlayingCard card={position.playerWarCard} label="War Card" />
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Game rules info */}
          <div className="bg-secondary/50 rounded-lg p-4">
            <h4 className="text-sm font-semibold mb-2">How to Play</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Place your ante bet (optional tie bet for 10:1 payout)</li>
              <li>• You and the dealer each get one card</li>
              <li>• Higher card wins - you get 1:1 on your ante</li>
              <li>• On a tie, you can go to war (double bet) or surrender (lose half ante)</li>
              <li>• If you win the war, you get 1:1 on the war bet</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default WarTable;
