"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { WalletButton } from "@/components/wallet/WalletButton";
import { MiningBoard } from "@/components/board/MiningBoard";
import { DiceAnimation } from "@/components/dice/DiceAnimation";
import { DeployPanel } from "@/components/deploy/DeployPanel";
import { RoundTimer } from "@/components/stats/RoundTimer";
import { BotLeaderboard } from "@/components/simulation/BotLeaderboard";
import { LiveAnalytics } from "@/components/analytics/LiveAnalytics";
import { NetworkToggle } from "@/components/network/NetworkToggle";
import { CrapsBettingPanel, CrapsGameStatus } from "@/components/craps";
import { useBoard } from "@/hooks/useBoard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGameStore } from "@/store/gameStore";
import { Dices, Grid3X3, Rocket, Loader2, Bot, BarChart3, Target } from "lucide-react";
import Link from "next/link";

export default function Home() {
  const [showDiceDemo, setShowDiceDemo] = useState(false);
  const [demoResult, setDemoResult] = useState<[number, number]>([3, 4]);
  const { selectedSquares } = useGameStore();
  const { board, round, loading: boardLoading, error: boardError } = useBoard();

  const handleDemoRoll = () => {
    setShowDiceDemo(true);
    // Generate random dice result
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    setDemoResult([die1, die2]);
  };

  // Check if the demo result matches any selected combination
  const demoIndex = (demoResult[0] - 1) * 6 + (demoResult[1] - 1);
  const demoWon = selectedSquares[demoIndex];

  // Convert round data to square data for MiningBoard
  const boardSquares = useMemo(() => {
    if (!round) return undefined;
    return round.deployed.map((deployed, index) => ({
      index,
      deployed,
      minerCount: Number(round.count[index]),
    }));
  }, [round]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Dices className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">OreCraps</span>
          </div>

          <div className="flex items-center gap-2">
            <NetworkToggle />
            <Link href="/analytics">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Analytics</span>
              </Button>
            </Link>
            <Button variant="outline" size="sm" onClick={handleDemoRoll}>
              <Dices className="mr-2 h-4 w-4" />
              Demo Roll
            </Button>
            <WalletButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1">
        {/* Round Timer */}
        <div className="mb-6">
          {boardLoading ? (
            <Card className="overflow-hidden">
              <div className="p-4 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Loading round data...</span>
              </div>
            </Card>
          ) : boardError ? (
            <Card className="overflow-hidden">
              <div className="p-4 flex items-center justify-center gap-3">
                <div className="p-2 rounded-lg bg-muted">
                  <Dices className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground">{boardError}</span>
              </div>
            </Card>
          ) : board && round ? (
            <RoundTimer
              roundId={Number(board.roundId)}
              startSlot={Number(round.expiresAt) - Number(board.roundSlots)}
              endSlot={Number(round.expiresAt)}
              currentSlot={Number(board.currentSlot)}
            />
          ) : null}
        </div>

        {/* Demo Dice Animation Modal */}
        {showDiceDemo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setShowDiceDemo(false)}
          >
            <Card className="p-8" onClick={(e) => e.stopPropagation()}>
              <CardContent className="pt-6">
                <DiceAnimation
                  die1={demoResult[0]}
                  die2={demoResult[1]}
                  isRolling={true}
                  onRollComplete={() => {
                    setTimeout(() => setShowDiceDemo(false), 2000);
                  }}
                />
                <div className="mt-6 text-center">
                  <p className="text-muted-foreground">
                    Combination:{" "}
                    <span className="font-bold text-primary">
                      {demoResult[0]}-{demoResult[1]}
                    </span>
                  </p>
                  {selectedSquares.filter(Boolean).length > 0 && (
                    <>
                      {demoWon ? (
                        <motion.p
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="text-2xl font-bold text-green-500 mt-2"
                        >
                          WINNER!
                        </motion.p>
                      ) : (
                        <p className="text-lg text-red-400 mt-2">
                          Not in your selection
                        </p>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Desktop Layout - Single screen */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4">
          {/* Left Column - Mining Board */}
          <div className="lg:col-span-7 min-w-0">
            <MiningBoard squares={boardSquares} isRoundActive={!!board} />
          </div>

          {/* Right Column - Craps, Deploy, Leaderboard & Analytics */}
          <div className="lg:col-span-5 space-y-4 min-w-0">
            <CrapsGameStatus />
            <CrapsBettingPanel />
            <DeployPanel />
            <BotLeaderboard />
            <LiveAnalytics />
          </div>
        </div>

        {/* Mobile Layout with Tabs */}
        <div className="lg:hidden">
          <Tabs defaultValue="board" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="board">
                <Grid3X3 className="h-4 w-4 mr-1" />
                Board
              </TabsTrigger>
              <TabsTrigger value="craps">
                <Target className="h-4 w-4 mr-1" />
                Craps
              </TabsTrigger>
              <TabsTrigger value="deploy">
                <Rocket className="h-4 w-4 mr-1" />
                Deploy
              </TabsTrigger>
              <TabsTrigger value="bots">
                <Bot className="h-4 w-4 mr-1" />
                Bots
              </TabsTrigger>
              <TabsTrigger value="stats">
                <BarChart3 className="h-4 w-4 mr-1" />
                Stats
              </TabsTrigger>
            </TabsList>

            <TabsContent value="board" className="mt-4">
              <MiningBoard squares={boardSquares} isRoundActive={!!board} />
            </TabsContent>

            <TabsContent value="craps" className="mt-4 space-y-4">
              <CrapsGameStatus />
              <CrapsBettingPanel />
            </TabsContent>

            <TabsContent value="deploy" className="mt-4 space-y-4">
              <DeployPanel />
            </TabsContent>

            <TabsContent value="bots" className="mt-4">
              <BotLeaderboard />
            </TabsContent>

            <TabsContent value="stats" className="mt-4">
              <LiveAnalytics />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-3 flex-shrink-0">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          OreCraps - Stake RNG, Earn CRAP on Solana | All combinations have equal expected value
        </div>
      </footer>
    </div>
  );
}
