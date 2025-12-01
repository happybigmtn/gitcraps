"use client";

import { memo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useShallow } from "zustand/react/shallow";
import {
  useBetHistoryStore,
  useBetHistoryStats,
  formatBetForDisplay,
  type SettledBet,
} from "@/store/betHistoryStore";
import {
  History,
  TrendingUp,
  TrendingDown,
  Trash2,
  Trophy,
  Dices,
} from "lucide-react";

function BetHistoryComponent() {
  const [sortMode, setSortMode] = useState<"recent" | "pnl">("pnl");
  const stats = useBetHistoryStats();
  const bets = useBetHistoryStore(useShallow((state) =>
    sortMode === "pnl" ? state.getBetsSortedByPnL(25) : state.getRecentBets(25)
  ));
  const clearHistory = useBetHistoryStore((state) => state.clearHistory);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const truncateAddress = (addr: string) =>
    `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5" />
            <span>Bet History</span>
            {bets.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {bets.length}
              </Badge>
            )}
          </div>
          {bets.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => clearHistory()}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        {stats.totalBets > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-secondary/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Total Bets</div>
              <div className="font-mono font-bold">{stats.totalBets}</div>
            </div>
            <div className="p-2 bg-secondary/50 rounded-lg">
              <div className="text-xs text-muted-foreground">Win Rate</div>
              <div className="font-mono font-bold">{stats.winRate.toFixed(1)}%</div>
            </div>
            <div
              className={`p-2 rounded-lg ${
                stats.netPnL >= 0 ? "bg-green-500/10" : "bg-red-500/10"
              }`}
            >
              <div className="text-xs text-muted-foreground">Net PnL</div>
              <div
                className={`font-mono font-bold ${
                  stats.netPnL >= 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {stats.netPnL >= 0 ? "+" : ""}
                {stats.netPnL.toFixed(4)}
              </div>
            </div>
          </div>
        )}

        {/* Sort Tabs */}
        <Tabs
          value={sortMode}
          onValueChange={(v) => setSortMode(v as "recent" | "pnl")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pnl">
              <Trophy className="h-3 w-3 mr-1" />
              By PnL
            </TabsTrigger>
            <TabsTrigger value="recent">
              <History className="h-3 w-3 mr-1" />
              Recent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pnl" className="mt-3">
            <BetList bets={bets} formatTime={formatTime} truncateAddress={truncateAddress} />
          </TabsContent>

          <TabsContent value="recent" className="mt-3">
            <BetList bets={bets} formatTime={formatTime} truncateAddress={truncateAddress} />
          </TabsContent>
        </Tabs>

        {/* Empty State */}
        {bets.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-muted/30 blur-2xl rounded-full" />
              <Dices className="relative h-12 w-12 text-muted-foreground/50" />
            </div>
            <h3 className="text-sm font-medium mb-1">No bets yet</h3>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              Place and settle bets to see your history here
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface BetListProps {
  bets: SettledBet[];
  formatTime: (timestamp: number) => string;
  truncateAddress: (addr: string) => string;
}

function BetList({ bets, formatTime, truncateAddress }: BetListProps) {
  if (bets.length === 0) return null;

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {bets.map((bet, index) => {
        const { betName, diceSum, isWin, pnlFormatted, pnlClass } =
          formatBetForDisplay(bet);

        return (
          <div
            key={bet.id}
            className="flex items-center justify-between p-2 bg-secondary/30 rounded-lg text-sm"
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${
                  isWin ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"
                }`}
              >
                {index + 1}
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{betName}</span>
                  {isWin ? (
                    <TrendingUp className="h-3 w-3 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-red-500" />
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <span>
                    {bet.diceResult[0]} + {bet.diceResult[1]} = {diceSum}
                  </span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{truncateAddress(bet.player)}</span>
                  <span className="text-muted-foreground/50">|</span>
                  <span>{formatTime(bet.timestamp)}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`font-mono font-bold ${pnlClass}`}>
                {pnlFormatted}
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">
                {bet.betAmount.toFixed(4)} CRAP
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const BetHistory = memo(BetHistoryComponent);
