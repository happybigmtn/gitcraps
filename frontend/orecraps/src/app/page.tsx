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
import { CrapsBettingPanel, CrapsGameStatus, BetHistory, CrapsOutcomeBoard, TrueOddsBetPanel } from "@/components/craps";
import { useBoard } from "@/hooks/useBoard";
import { useNetworkStore } from "@/store/networkStore";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGameStore } from "@/store/gameStore";
import { useCrapsStore, useCurrentEpoch } from "@/store/crapsStore";
import { Dices, Grid3X3, Loader2, Bot, BarChart3, Target, Droplets } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function Home() {
  const [showDiceDemo, setShowDiceDemo] = useState(false);
  const [demoResult, setDemoResult] = useState<[number, number]>([3, 4]);
  const [isRolling, setIsRolling] = useState(false);
  const [isDiceAnimating, setIsDiceAnimating] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const { selectedSquares } = useGameStore();
  const { board, round, loading: boardLoading, error: boardError, refetch } = useBoard();
  const { network } = useNetworkStore();
  const { publicKey, connected } = useWallet();
  const setLastRollResult = useCrapsStore((state) => state.setLastRollResult);
  const clearLastRollResult = useCrapsStore((state) => state.clearLastRollResult);
  const crapsEpoch = useCurrentEpoch();

  // Roll the dice - calls settle-round API for entropy, then settle-craps for bet resolution
  // ALL rolls are on-chain transactions. No simulated/demo rolls.
  const handleRoll = async () => {
    if (network !== "localnet" && network !== "devnet") {
      toast.error("On-chain rolls only available on localnet/devnet");
      return;
    }

    setIsRolling(true);
    toast.info("Settling round on-chain...");
    try {
      let rollResult: { die1: number; die2: number; sum: number; winningSquare: number } | null = null;

      if (network === "localnet") {
        // Localnet: Use entropy-based settle-round
        const roundResponse = await fetch("/api/settle-round", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        const roundData = await roundResponse.json();
        if (roundData.success && roundData.diceResults) {
          rollResult = {
            die1: roundData.diceResults.die1,
            die2: roundData.diceResults.die2,
            sum: roundData.diceResults.sum,
            winningSquare: roundData.winningSquare,
          };
        }
      } else if (network === "devnet") {
        // Devnet: Use random roll generator (program has localnet feature enabled)
        const rollResponse = await fetch("/api/devnet-roll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        const rollData = await rollResponse.json();
        if (rollData.success && rollData.diceResults) {
          rollResult = {
            die1: rollData.diceResults.die1,
            die2: rollData.diceResults.die2,
            sum: rollData.diceResults.sum,
            winningSquare: rollData.winningSquare,
          };
        }
      }

      if (rollResult) {
        // Store roll result for craps settlement synchronization
        setLastRollResult({
          ...rollResult,
          timestamp: Date.now(),
        });

        setDemoResult([rollResult.die1, rollResult.die2]);
        setIsDiceAnimating(true);
        setShowDiceDemo(true);
        toast.success(`On-chain roll: ${rollResult.die1} + ${rollResult.die2} = ${rollResult.sum}`);
      }

      // Step 2: Try to settle craps bets
      // For localnet: use admin API
      // For devnet: user needs to sign via wallet (handled in useBetting.settleBets)
      if (network === "localnet") {
        const crapsResponse = await fetch("/api/settle-craps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            playerPubkey: publicKey?.toBase58(),
            winningSquare: rollResult?.winningSquare,
          }),
        });

        const crapsData = await crapsResponse.json();
        if (crapsData.success) {
          toast.success(`Craps bets settled! Dice: ${crapsData.diceResults.die1} + ${crapsData.diceResults.die2} = ${crapsData.diceResults.sum}`);
        } else if (crapsData.error && !crapsData.error.includes("No craps position")) {
          toast.info(crapsData.error || "No craps bets to settle");
        }
      } else if (network === "devnet" && publicKey) {
        // For devnet, show user a message that they need to settle via the UI
        toast.info("Use 'Settle Bets' button in Craps tab to settle your bets");
      }

      // Small delay to allow on-chain state to propagate before refetching
      await new Promise((resolve) => setTimeout(resolve, 500));
      refetch();
    } catch {
      toast.error("Failed to settle round on-chain");
    } finally {
      setIsRolling(false);
    }
  };

  // Claim tokens from faucet
  const handleClaimFaucet = async () => {
    if (!publicKey || !connected) {
      toast.error("Connect wallet first");
      return;
    }

    setIsClaiming(true);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey.toBase58(),
          network,
        }),
      });

      const data = await response.json();
      if (data.success) {
        if (data.crapAmount) {
          toast.success(`Claimed ${data.rngAmount} RNG + ${data.crapAmount} CRAP tokens!`);
        } else {
          toast.success(`Claimed ${data.rngAmount} RNG tokens!`);
        }
      } else {
        toast.error(data.error || "Faucet claim failed");
      }
    } catch {
      toast.error("Failed to claim from faucet");
    } finally {
      setIsClaiming(false);
    }
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
              onClick={handleRoll}
              disabled={isRolling}
              className="h-8 px-2 font-mono text-xs hover:bg-primary/10 hover:text-primary snappy"
            >
              {isRolling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Dices className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline ml-1.5">ROLL</span>
            </Button>
            {(network === "localnet" || network === "devnet") && connected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClaimFaucet}
                disabled={isClaiming}
                className="h-8 px-2 font-mono text-xs hover:bg-[oklch(0.7_0.15_220)]/10 hover:text-[oklch(0.7_0.15_220)] snappy"
              >
                {isClaiming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Droplets className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline ml-1.5">FAUCET</span>
              </Button>
            )}
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
              fallbackEpoch={crapsEpoch}
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
                      isRolling={isDiceAnimating}
                      onRollComplete={() => {
                        setIsDiceAnimating(false);
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

        {/* Tabbed Layout - Used for all screen sizes */}
        <div>
          <Tabs defaultValue="mine" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="mine">
                <Grid3X3 className="h-4 w-4 mr-1" />
                Mine
              </TabsTrigger>
              <TabsTrigger value="craps">
                <Target className="h-4 w-4 mr-1" />
                Craps
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

            <TabsContent value="mine" className="mt-4 space-y-4">
              <MiningBoard squares={boardSquares} isRoundActive={!!board} />
              <DeployPanel />
            </TabsContent>

            <TabsContent value="craps" className="mt-4 space-y-4">
              <CrapsGameStatus />
              <div className="grid lg:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <CrapsBettingPanel />
                  <TrueOddsBetPanel />
                </div>
                <div className="space-y-4">
                  <CrapsOutcomeBoard />
                  <BetHistory />
                </div>
              </div>
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
