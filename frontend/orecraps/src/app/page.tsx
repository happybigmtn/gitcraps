"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    setDemoResult([die1, die2]);
  };

  const demoIndex = (demoResult[0] - 1) * 6 + (demoResult[1] - 1);
  const demoWon = selectedSquares[demoIndex];

  const boardSquares = useMemo(() => {
    if (!round) return undefined;
    return round.deployed.map((deployed, index) => ({
      index,
      deployed,
      minerCount: round.count[index],
    }));
  }, [round]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* MSCHF-Inspired Header */}
      <header className="border-b border-border/50 bg-background/95 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo - Bold, Technical */}
          <motion.div
            className="flex items-center gap-2"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="relative">
              <Dices className="h-6 w-6 text-primary" />
              <motion.div
                className="absolute inset-0 bg-primary/30 blur-lg"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <span className="font-mono font-bold text-lg tracking-tight">
              ORE<span className="text-primary">CRAPS</span>
            </span>
            <span className="hidden sm:inline text-[10px] font-mono text-muted-foreground ml-1 border-l border-border pl-2">
              DROP #001
            </span>
          </motion.div>

          {/* Navigation - Snappy */}
          <div className="flex items-center gap-1.5">
            <NetworkToggle />
            <Link href="/analytics">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 font-mono text-xs hover:bg-primary/10 hover:text-primary snappy"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline ml-1.5">STATS</span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDemoRoll}
              className="h-8 px-2 font-mono text-xs hover:bg-primary/10 hover:text-primary snappy"
            >
              <Dices className="h-3.5 w-3.5" />
              <span className="hidden sm:inline ml-1.5">ROLL</span>
            </Button>
            <WalletButton />
          </div>
        </div>

        {/* Magritte-Inspired Disclaimer Bar */}
        <div className="border-t border-border/30 bg-secondary/30">
          <div className="container mx-auto px-4 py-1.5 flex items-center justify-center gap-4">
            <span className="font-mono text-[10px] text-muted-foreground tracking-wide">
              CECI N&apos;EST PAS UN CASINO
            </span>
            <span className="text-muted-foreground/30">|</span>
            <span className="font-mono text-[10px] text-muted-foreground/70">
              all outcomes equally probable (statistically speaking)
            </span>
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
              roundId={board.roundId}
              startSlot={round.expiresAt - board.roundSlots}
              endSlot={round.expiresAt}
              currentSlot={board.currentSlot}
            />
          ) : null}
        </div>

        {/* Demo Dice Animation Modal - MSCHF Style */}
        <AnimatePresence>
          {showDiceDemo && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md"
              onClick={() => setShowDiceDemo(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <Card className="border-2 border-primary/30 bg-card/95 backdrop-blur-sm">
                  <CardContent className="p-8">
                    <DiceAnimation
                      die1={demoResult[0]}
                      die2={demoResult[1]}
                      isRolling={true}
                      onRollComplete={() => {
                        setTimeout(() => setShowDiceDemo(false), 2000);
                      }}
                    />
                    <div className="mt-6 text-center">
                      <p className="font-mono text-sm text-muted-foreground">
                        OUTPUT:{" "}
                        <span className="font-bold text-primary">
                          [{demoResult[0]}, {demoResult[1]}]
                        </span>
                      </p>
                      {selectedSquares.filter(Boolean).length > 0 && (
                        <>
                          {demoWon ? (
                            <motion.div
                              initial={{ scale: 0, rotate: -10 }}
                              animate={{ scale: 1, rotate: 0 }}
                              className="mt-4"
                            >
                              <span className="inline-block px-4 py-2 bg-[oklch(0.75_0.2_145)] text-[oklch(0.1_0_0)] font-mono font-bold text-lg rounded">
                                WINNER
                              </span>
                              <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                                (this means nothing)
                              </p>
                            </motion.div>
                          ) : (
                            <div className="mt-4">
                              <span className="font-mono text-sm text-muted-foreground">
                                NOT SELECTED
                              </span>
                              <p className="text-[10px] text-muted-foreground/50 mt-1 font-mono">
                                (this also means nothing)
                              </p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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

      {/* MSCHF-Style Footer */}
      <footer className="border-t border-border/50 py-4 flex-shrink-0 bg-secondary/20">
        <div className="container mx-auto px-4">
          {/* Main disclaimer */}
          <div className="text-center mb-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              <span className="text-primary">[</span>
              {" "}THIS IS NOT GAMBLING. THIS IS NOT SKILL. THIS IS MATH.{" "}
              <span className="text-primary">]</span>
            </p>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-muted-foreground/60">
            <span>36 OUTCOMES</span>
            <span className="text-muted-foreground/30">|</span>
            <span>EQUAL PROBABILITY</span>
            <span className="text-muted-foreground/30">|</span>
            <span>0% HOUSE EDGE*</span>
            <span className="text-muted-foreground/30">|</span>
            <span>SOLANA</span>
          </div>

          {/* Ironic fine print */}
          <div className="mt-3 text-center">
            <p className="text-[9px] text-muted-foreground/40 font-mono italic">
              *mathematically speaking. your results may vary. past performance does not guarantee future results.
              this is not financial advice. or any advice. we are not responsible for anything.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
