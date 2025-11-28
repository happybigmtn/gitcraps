"use client";

import { useCallback, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useCrapsStore,
  useTotalPendingAmount,
  usePendingBetCount,
  getBetTypeName,
} from "@/store/crapsStore";
import { useCraps } from "@/hooks/useCraps";
import {
  CrapsBetType,
  POINT_NUMBERS,
  HARDWAY_NUMBERS,
  createPlaceCrapsBetInstruction,
  createClaimCrapsWinningsInstruction,
} from "@/lib/program";
import { toast } from "sonner";
import {
  Dices,
  Coins,
  Target,
  CircleDot,
  Loader2,
  Trash2,
  Send,
  DollarSign,
  Info,
} from "lucide-react";

export function CrapsBettingPanel() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { game, position, isComeOut, currentPoint, pendingWinnings, refetch } =
    useCraps();

  const {
    betAmount,
    setBetAmount,
    pendingBets,
    addPassLineBet,
    addDontPassBet,
    addFieldBet,
    addAnySevenBet,
    addPlaceBet,
    addHardwayBet,
    addPendingBet,
    removePendingBet,
    clearPendingBets,
  } = useCrapsStore();

  const totalPending = useTotalPendingAmount();
  const pendingCount = usePendingBetCount();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Submit all pending bets
  const handleSubmitBets = useCallback(async () => {
    if (!publicKey || !connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (pendingBets.length === 0) {
      toast.error("No bets to submit");
      return;
    }

    try {
      setIsSubmitting(true);
      toast.info("Preparing transaction...");

      const transaction = new Transaction();

      // Add all pending bets as instructions
      for (const bet of pendingBets) {
        const amountLamports = BigInt(Math.floor(bet.amount * LAMPORTS_PER_SOL));
        const ix = createPlaceCrapsBetInstruction(
          publicKey!,
          bet.betType,
          bet.point,
          amountLamports
        );
        transaction.add(ix);
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey!;

      toast.info("Please confirm in your wallet...");
      const signature = await sendTransaction(transaction, connection);

      // Validate signature
      if (!signature || typeof signature !== 'string' || signature.length === 0) {
        throw new Error('Invalid transaction signature received');
      }

      toast.info("Confirming transaction...");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      toast.success(`Placed ${pendingBets.length} bet(s) successfully!`);
      clearPendingBets();
      refetch();
    } catch (error) {
      console.error("Submit bets error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("User rejected")) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(`Failed to place bets: ${errorMessage}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    publicKey,
    connected,
    pendingBets,
    connection,
    sendTransaction,
    clearPendingBets,
    refetch,
  ]);

  // Claim winnings
  const handleClaimWinnings = useCallback(async () => {
    if (!publicKey || !connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (pendingWinnings === 0n) {
      toast.error("No winnings to claim");
      return;
    }

    try {
      setIsClaiming(true);
      toast.info("Preparing claim...");

      const ix = createClaimCrapsWinningsInstruction(publicKey);
      const transaction = new Transaction().add(ix);

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      toast.info("Please confirm in your wallet...");
      const signature = await sendTransaction(transaction, connection);

      // Validate signature
      if (!signature || typeof signature !== 'string' || signature.length === 0) {
        throw new Error('Invalid transaction signature received');
      }

      toast.info("Confirming transaction...");
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      const winAmount = Number(pendingWinnings) / LAMPORTS_PER_SOL;
      toast.success(`Claimed ${winAmount.toFixed(4)} SOL!`);
      refetch();
    } catch (error) {
      console.error("Claim error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("User rejected")) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(`Failed to claim: ${errorMessage}`);
      }
    } finally {
      setIsClaiming(false);
    }
  }, [publicKey, connected, pendingWinnings, connection, sendTransaction, refetch]);

  // Check if a bet type can be placed
  const canPlaceBet = useCallback(
    (betType: CrapsBetType): boolean => {
      if (!game) return false;

      const hasPassLine = (position?.passLine ?? 0n) > 0n;
      const hasDontPass = (position?.dontPass ?? 0n) > 0n;

      switch (betType) {
        case CrapsBetType.PassLine:
        case CrapsBetType.DontPass:
          return isComeOut;
        case CrapsBetType.PassOdds:
          return !isComeOut && currentPoint !== 0 && hasPassLine;
        case CrapsBetType.DontPassOdds:
          return !isComeOut && currentPoint !== 0 && hasDontPass;
        default:
          return true;
      }
    },
    [game, position, isComeOut, currentPoint]
  );

  const houseBankrollSOL = game
    ? Number(game.houseBankroll) / LAMPORTS_PER_SOL
    : 0;

  // Memoized handlers for bet amount presets
  const handleSetAmount001 = useCallback(() => setBetAmount(0.01), [setBetAmount]);
  const handleSetAmount01 = useCallback(() => setBetAmount(0.1), [setBetAmount]);
  const handleSetAmount1 = useCallback(() => setBetAmount(1), [setBetAmount]);

  // Memoized handler for bet amount input change
  const handleBetAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBetAmount(parseFloat(e.target.value) || 0);
    },
    [setBetAmount]
  );

  // Memoized handlers for adding bets
  const handleAddPassOdds = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.PassOdds,
      point: currentPoint,
      amount: betAmount,
    });
  }, [addPendingBet, currentPoint, betAmount]);

  const handleAddDontPassOdds = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.DontPassOdds,
      point: currentPoint,
      amount: betAmount,
    });
  }, [addPendingBet, currentPoint, betAmount]);

  const handleAddAnyCraps = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.AnyCraps,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddYoEleven = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.YoEleven,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddAces = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.Aces,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddTwelve = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.Twelve,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  // Memoized handler for removing individual pending bets
  const handleRemovePendingBet = useCallback(
    (index: number) => () => {
      removePendingBet(index);
    },
    [removePendingBet]
  );

  // Elegant empty state when game is not initialized
  if (!game) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Dices className="h-5 w-5" />
            <span>Craps Bets</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
              <Dices className="relative h-16 w-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium mb-2">Craps game not initialized</h3>
            <p className="text-sm text-muted-foreground max-w-[240px] mb-6">
              The craps table is being set up. Connect to a network with an active game to start betting.
            </p>
            <Button variant="outline" size="sm" disabled>
              <Dices className="mr-2 h-4 w-4" />
              Waiting for Game...
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dices className="h-5 w-5" />
            <span>Craps Bets</span>
          </div>
          <Badge variant={isComeOut ? "default" : "secondary"}>
            {isComeOut ? "Come-Out Roll" : `Point: ${currentPoint}`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Game Status - Simplified */}
        <div className="flex justify-between text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
          <span>Epoch #{game.epochId.toString()}</span>
          <span className="font-mono">{houseBankrollSOL.toFixed(2)} SOL</span>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="bet-amount">Bet Amount (SOL)</Label>
          <div className="flex gap-2">
            <Input
              id="bet-amount"
              type="number"
              step="0.01"
              min="0.01"
              value={betAmount}
              onChange={handleBetAmountChange}
              className="font-mono"
            />
            <Button variant="outline" size="sm" onClick={handleSetAmount001}>
              0.01
            </Button>
            <Button variant="outline" size="sm" onClick={handleSetAmount01}>
              0.1
            </Button>
            <Button variant="outline" size="sm" onClick={handleSetAmount1}>
              1
            </Button>
          </div>
        </div>

        <Separator />

        {/* Bet Type Tabs */}
        <Tabs defaultValue="line" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="line">Line</TabsTrigger>
            <TabsTrigger value="place">Place</TabsTrigger>
            <TabsTrigger value="props">Props</TabsTrigger>
            <TabsTrigger value="hardways">Hard</TabsTrigger>
          </TabsList>

          {/* Line Bets */}
          <TabsContent value="line" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={() => addPassLineBet()}
                disabled={!canPlaceBet(CrapsBetType.PassLine)}
              >
                <Target className="h-4 w-4 mb-1" />
                <span className="text-xs font-bold">Pass Line</span>
                <span className="text-[10px] text-muted-foreground">1:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={() => addDontPassBet()}
                disabled={!canPlaceBet(CrapsBetType.DontPass)}
              >
                <CircleDot className="h-4 w-4 mb-1" />
                <span className="text-xs font-bold">Don't Pass</span>
                <span className="text-[10px] text-muted-foreground">1:1</span>
              </Button>
            </div>
            {!isComeOut && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex flex-col"
                  onClick={handleAddPassOdds}
                  disabled={!canPlaceBet(CrapsBetType.PassOdds)}
                >
                  <span className="text-xs">Pass Odds</span>
                  <span className="text-[10px] text-muted-foreground">0% edge</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 flex flex-col"
                  onClick={handleAddDontPassOdds}
                  disabled={!canPlaceBet(CrapsBetType.DontPassOdds)}
                >
                  <span className="text-xs">Don't Pass Odds</span>
                  <span className="text-[10px] text-muted-foreground">0% edge</span>
                </Button>
              </div>
            )}
            <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
              <Info className="inline h-3 w-3 mr-1" />
              {isComeOut
                ? "Place Pass/Don't Pass during come-out roll"
                : "Take odds on your existing line bets"}
            </div>
          </TabsContent>

          {/* Place Bets */}
          <TabsContent value="place" className="space-y-3 mt-4">
            <div className="grid grid-cols-3 gap-2">
              {POINT_NUMBERS.map((point) => {
                const payoutInfo =
                  point === 4 || point === 10
                    ? "9:5"
                    : point === 5 || point === 9
                    ? "7:5"
                    : "7:6";
                const edge =
                  point === 6 || point === 8
                    ? "1.5%"
                    : point === 5 || point === 9
                    ? "4%"
                    : "6.7%";
                return (
                  <Button
                    key={point}
                    variant="outline"
                    className="h-14 flex flex-col"
                    onClick={() => addPlaceBet(point)}
                  >
                    <span className="text-lg font-bold">{point}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {payoutInfo} ({edge})
                    </span>
                  </Button>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
              <Info className="inline h-3 w-3 mr-1" />
              Place bets win when your number hits before 7
            </div>
          </TabsContent>

          {/* Proposition Bets */}
          <TabsContent value="props" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={() => addFieldBet()}
              >
                <span className="text-sm font-bold">Field</span>
                <span className="text-[10px] text-muted-foreground">
                  2,3,4,9,10,11,12
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={() => addAnySevenBet()}
              >
                <span className="text-sm font-bold">Any 7</span>
                <span className="text-[10px] text-muted-foreground">4:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddAnyCraps}
              >
                <span className="text-sm font-bold">Any Craps</span>
                <span className="text-[10px] text-muted-foreground">7:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddYoEleven}
              >
                <span className="text-sm font-bold">Yo (11)</span>
                <span className="text-[10px] text-muted-foreground">15:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddAces}
              >
                <span className="text-sm font-bold">Aces (2)</span>
                <span className="text-[10px] text-muted-foreground">30:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddTwelve}
              >
                <span className="text-sm font-bold">12 (Boxcars)</span>
                <span className="text-[10px] text-muted-foreground">30:1</span>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
              <Info className="inline h-3 w-3 mr-1" />
              Single-roll bets: win or lose on the next roll
            </div>
          </TabsContent>

          {/* Hardways */}
          <TabsContent value="hardways" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-2">
              {HARDWAY_NUMBERS.map((hardway) => {
                const payout = hardway === 4 || hardway === 10 ? "7:1" : "9:1";
                const edge = hardway === 4 || hardway === 10 ? "11.1%" : "9.1%";
                return (
                  <Button
                    key={hardway}
                    variant="outline"
                    className="h-16 flex flex-col"
                    onClick={() => addHardwayBet(hardway)}
                  >
                    <span className="text-lg font-bold">Hard {hardway}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {payout} ({edge})
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {hardway / 2}+{hardway / 2}
                    </span>
                  </Button>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
              <Info className="inline h-3 w-3 mr-1" />
              Hardways win if doubles hit before 7 or easy way
            </div>
          </TabsContent>
        </Tabs>

        <Separator />

        {/* Pending Bets */}
        {pendingBets.length > 0 && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label className="text-sm">Pending Bets ({pendingCount})</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPendingBets}
                className="h-6 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {pendingBets.map((bet, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-2 bg-secondary/50 rounded text-sm"
                >
                  <span>{getBetTypeName(bet.betType, bet.point)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{bet.amount.toFixed(2)} SOL</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePendingBet(index)}
                      className="h-6 w-6 p-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>Total</span>
              <span className="font-mono text-chart-2">
                {totalPending.toFixed(2)} SOL
              </span>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmitBets}
          disabled={!connected || isSubmitting || pendingBets.length === 0}
        >
          {!connected ? (
            "Connect Wallet"
          ) : isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Placing Bets...
            </>
          ) : (
            <>
              <Send className="mr-2 h-5 w-5" />
              Place {pendingCount} Bet{pendingCount !== 1 ? "s" : ""} (
              {totalPending.toFixed(2)} SOL)
            </>
          )}
        </Button>

        {/* Claim Winnings */}
        {pendingWinnings > 0n && (
          <>
            <Separator />
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-green-500" />
                  <span className="text-sm">Pending Winnings</span>
                </div>
                <span className="font-mono font-bold text-green-500">
                  {(Number(pendingWinnings) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </span>
              </div>
              <Button
                className="w-full mt-2"
                variant="outline"
                onClick={handleClaimWinnings}
                disabled={!connected || isClaiming}
              >
                {isClaiming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  <>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Claim Winnings
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* Position Summary */}
        {position && (
          <>
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex justify-between">
                <span>Total Wagered</span>
                <span className="font-mono">
                  {(Number(position.totalWagered) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Won</span>
                <span className="font-mono text-green-500">
                  {(Number(position.totalWon) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Lost</span>
                <span className="font-mono text-red-500">
                  {(Number(position.totalLost) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                </span>
              </div>
              {Number(position.passLine) > 0 && (
                <div className="flex justify-between">
                  <span>Pass Line Bet</span>
                  <span className="font-mono text-yellow-500">
                    {(Number(position.passLine) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                  </span>
                </div>
              )}
              {Number(position.dontPass) > 0 && (
                <div className="flex justify-between">
                  <span>Don't Pass Bet</span>
                  <span className="font-mono text-yellow-500">
                    {(Number(position.dontPass) / LAMPORTS_PER_SOL).toFixed(4)} SOL
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
