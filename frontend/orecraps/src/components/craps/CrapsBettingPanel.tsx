"use client";

/**
 * CrapsBettingPanel Component - Migrated for Anza Kit compatibility
 *
 * This component provides craps betting functionality.
 * Uses wallet adapter for wallet state and TransactionService for transactions.
 * Kit types are available via re-exports from hooks/lib.
 */

import { useCallback, useState, memo, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { ONE_CRAP, formatCrap, getCrapMint } from "@/lib/solana";
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
  useLastRollResult,
} from "@/store/crapsStore";
import {
  useBetHistoryStore,
  extractAndCalculateBets,
} from "@/store/betHistoryStore";
import { useCraps } from "@/hooks/useCraps";
import { useBoard } from "@/hooks/useBoard";
import { useNetworkStore } from "@/store/networkStore";
import {
  CrapsBetType,
  POINT_NUMBERS,
  HARDWAY_NUMBERS,
  pointToIndex,
} from "@/lib/program";
import { createTransactionService } from "@/services/transactionService";
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
  CheckCircle2,
} from "lucide-react";
import { squareToDice } from "@/lib/dice";

function CrapsBettingPanelComponent() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { game, position, isComeOut, currentPoint, pendingWinnings, refetch } =
    useCraps();
  const { round, refetch: refetchBoard } = useBoard();
  const network = useNetworkStore((state) => state.network);

  const {
    betAmount,
    setBetAmount,
    pendingBets,
    addPassLineBet,
    addDontPassBet,
    addComeBet,
    addDontComeBet,
    addComeOddsBet,
    addDontComeOddsBet,
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
  const addBetToHistory = useBetHistoryStore((state) => state.addBet);
  const lastRollResult = useLastRollResult();
  const clearLastRollResult = useCrapsStore((state) => state.clearLastRollResult);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [crapBalance, setCrapBalance] = useState<number | null>(null);

  // Fetch CRAP token balance when wallet changes
  useEffect(() => {
    async function fetchCrapBalance() {
      if (!wallet.publicKey || !wallet.connected) {
        setCrapBalance(null);
        return;
      }
      try {
        const crapMint = getCrapMint(network);
        const ata = await getAssociatedTokenAddress(crapMint, wallet.publicKey);
        const balance = await connection.getTokenAccountBalance(ata);
        setCrapBalance(Number(balance.value.uiAmount || 0));
      } catch {
        // Token account doesn't exist or other error
        setCrapBalance(0);
      }
    }
    fetchCrapBalance();
  }, [wallet.publicKey, wallet.connected, connection, network]);

  const hasInsufficientCrap = crapBalance !== null && totalPending > crapBalance;

  // Submit all pending bets
  const handleSubmitBets = useCallback(async () => {
    if (!wallet.publicKey || !wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (pendingBets.length === 0) {
      toast.error("No bets to submit");
      return;
    }

    // Check for CRAP balance before attempting transaction
    if (crapBalance === null || crapBalance === 0) {
      toast.error("You need CRAP tokens to place bets. Get CRAP tokens from the faucet or Fund House.");
      return;
    }

    if (hasInsufficientCrap) {
      toast.error(`Insufficient CRAP balance. You have ${crapBalance?.toFixed(4)} CRAP but need ${totalPending.toFixed(4)} CRAP`);
      return;
    }

    try {
      setIsSubmitting(true);
      toast.info("Preparing transaction...");

      // Use TransactionService to place bets
      const txService = createTransactionService();
      const bets = pendingBets.map((bet) => ({
        betType: bet.betType,
        point: bet.point,
        amount: bet.amount,
      }));

      toast.info("Please confirm in your wallet...");
      const result = await txService.placeCrapsBets(wallet, connection, bets);

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      toast.success(`Placed ${result.betsPlaced} bet(s) successfully!`);
      clearPendingBets();
      refetch();
      // Refresh CRAP balance after placing bets
      if (wallet.publicKey) {
        try {
          const crapMint = getCrapMint(network);
          const ata = await getAssociatedTokenAddress(crapMint, wallet.publicKey);
          const balance = await connection.getTokenAccountBalance(ata);
          setCrapBalance(Number(balance.value.uiAmount || 0));
        } catch {
          setCrapBalance(0);
        }
      }
    } catch (error) {
      console.error("Submit bets error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to place bets: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    wallet,
    pendingBets,
    connection,
    clearPendingBets,
    refetch,
    crapBalance,
    hasInsufficientCrap,
    totalPending,
    network,
  ]);

  // Claim winnings
  const handleClaimWinnings = useCallback(async () => {
    if (!wallet.publicKey || !wallet.connected) {
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

      // Use TransactionService to claim winnings
      const txService = createTransactionService();

      toast.info("Please confirm in your wallet...");
      const result = await txService.claimCrapsWinnings(wallet, connection);

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      const winAmount = Number(pendingWinnings) / Number(ONE_CRAP);
      toast.success(`Claimed ${winAmount.toFixed(4)} CRAP!`);
      refetch();
    } catch (error) {
      console.error("Claim error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to claim: ${errorMessage}`);
    } finally {
      setIsClaiming(false);
    }
  }, [wallet, pendingWinnings, connection, refetch]);

  // Settle bets using wallet transaction (for wallet users)
  const handleSettleBets = useCallback(async () => {
    if (!wallet.publicKey || !wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!position) {
      toast.error("No position to settle. Place bets first.");
      return;
    }

    // On devnet/localnet, use stored roll result first, then generate new if needed
    let effectiveWinningSquare = round?.winningSquare ?? null;

    // Check if we have a stored roll result from the main ROLL button (within last 5 minutes)
    const ROLL_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
    if (
      effectiveWinningSquare === null &&
      lastRollResult &&
      Date.now() - lastRollResult.timestamp < ROLL_EXPIRY_MS
    ) {
      effectiveWinningSquare = lastRollResult.winningSquare;
      toast.info(
        `Using stored roll: ${lastRollResult.die1} + ${lastRollResult.die2} = ${lastRollResult.sum}`
      );
    }

    // Only generate new roll if no stored result and on test network
    if (effectiveWinningSquare === null && (network === "devnet" || network === "localnet")) {
      try {
        toast.info("Generating random dice roll...");
        const rollResponse = await fetch("/api/devnet-roll", { method: "POST" });
        const rollData = await rollResponse.json();

        if (!rollData.success) {
          throw new Error(rollData.error || "Failed to generate roll");
        }

        effectiveWinningSquare = rollData.winningSquare;
        const { die1, die2, sum } = rollData.diceResults;
        toast.info(`Random roll: ${die1} + ${die2} = ${sum}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        toast.error(`Failed to generate random roll: ${errorMsg}`);
        return;
      }
    }

    if (effectiveWinningSquare === null) {
      toast.error("No round result available yet. Wait for round to complete.");
      return;
    }

    // Capture position data before settlement for history recording
    const positionSnapshot = { ...position };
    const playerPubkey = wallet.publicKey.toBase58();

    try {
      setIsSettling(true);
      toast.info("Preparing settlement transaction...");

      // Use TransactionService to settle bets
      const txService = createTransactionService();

      toast.info("Please confirm in your wallet...");
      const result = await txService.settleCraps(wallet, connection, {
        winningSquare: BigInt(effectiveWinningSquare),
        roundId: round?.id ?? 0n,
      });

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      const [die1, die2] = squareToDice(effectiveWinningSquare);
      const diceResult: [number, number] = [die1, die2];

      // Record settled bets to history
      const settledBets = extractAndCalculateBets(
        positionSnapshot,
        diceResult,
        playerPubkey,
        (round?.id ?? 0n).toString(),
        currentPoint,
        result.signature
      );

      // Add each settled bet to history
      settledBets.forEach((bet) => {
        addBetToHistory(bet);
      });

      const totalPnL = settledBets.reduce((sum, b) => sum + b.pnl, 0);
      const pnlStr = totalPnL >= 0 ? `+${totalPnL.toFixed(4)}` : totalPnL.toFixed(4);
      const diceSum = die1 + die2;

      // Determine the appropriate message based on game state
      // If we were on come-out (currentPoint was 0) and rolled a point number, show "Point established"
      const wasOnComeOut = currentPoint === 0;
      const isPointNumber = POINT_NUMBERS.includes(diceSum);

      let message: string;
      if (wasOnComeOut && isPointNumber) {
        message = `Point ${diceSum} established! Dice: ${die1} + ${die2} = ${diceSum}`;
      } else if (wasOnComeOut && (diceSum === 7 || diceSum === 11)) {
        message = `Natural ${diceSum}! Dice: ${die1} + ${die2} = ${diceSum} | PnL: ${pnlStr} CRAP`;
      } else if (wasOnComeOut && (diceSum === 2 || diceSum === 3 || diceSum === 12)) {
        message = `Craps ${diceSum}! Dice: ${die1} + ${die2} = ${diceSum} | PnL: ${pnlStr} CRAP`;
      } else if (diceSum === 7 && !wasOnComeOut) {
        message = `Seven out! Dice: ${die1} + ${die2} = ${diceSum} | PnL: ${pnlStr} CRAP`;
      } else {
        message = `Bets settled! Dice: ${die1} + ${die2} = ${diceSum} | PnL: ${pnlStr} CRAP`;
      }

      toast.success(message);

      // Clear the stored roll result after successful settlement
      clearLastRollResult();

      // Small delay to allow on-chain state to propagate before refetching
      await new Promise((resolve) => setTimeout(resolve, 500));
      refetch();
      refetchBoard();
    } catch (error) {
      console.error("Settle bets error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to settle bets: ${errorMessage}`);
    } finally {
      setIsSettling(false);
    }
  }, [wallet, round, position, connection, refetch, refetchBoard, currentPoint, addBetToHistory, network, lastRollResult, clearLastRollResult]);

  // Check if settlement is available
  // On devnet/localnet, allow settlement when position exists (we can generate random roll)
  const isTestNetwork = network === "devnet" || network === "localnet";
  const canSettle = position && (round?.winningSquare !== null || isTestNetwork);

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

  const houseBankrollCRAP = game
    ? Number(game.houseBankroll) / Number(ONE_CRAP)
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

  // Side bet handlers (come-out only)
  const handleAddFireBet = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.FireBet,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddDiffDoubles = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.DiffDoubles,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddRideTheLine = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.RideTheLine,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddMugsyCorner = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.MugsyCorner,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddHotHand = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.HotHand,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddReplayBet = useCallback(() => {
    addPendingBet({
      betType: CrapsBetType.ReplayBet,
      point: 0,
      amount: betAmount,
    });
  }, [addPendingBet, betAmount]);

  const handleAddFieldersChoice = useCallback((subBet: number) => () => {
    addPendingBet({
      betType: CrapsBetType.FieldersChoice,
      point: subBet,
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
          <span className="font-mono">{houseBankrollCRAP.toFixed(2)} CRAP</span>
        </div>

        {/* CRAP Balance Display */}
        {wallet.connected && crapBalance !== null && (
          <div className={`flex justify-between text-sm px-3 py-2 rounded-lg ${crapBalance === 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-secondary/30'}`}>
            <span className="text-muted-foreground">Your CRAP Balance</span>
            <span className={`font-mono font-bold ${crapBalance === 0 ? 'text-red-500' : hasInsufficientCrap ? 'text-yellow-500' : 'text-green-500'}`}>
              {crapBalance.toFixed(4)} CRAP
            </span>
          </div>
        )}

        {/* No CRAP Warning */}
        {wallet.connected && crapBalance === 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            <Info className="inline h-4 w-4 mr-1" />
            You don't have any CRAP tokens. Get some from the faucet or ask another player to send you some.
          </div>
        )}

        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="bet-amount">Bet Amount (CRAP)</Label>
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
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="line">Line</TabsTrigger>
            <TabsTrigger value="come">Come</TabsTrigger>
            <TabsTrigger value="place">Place</TabsTrigger>
            <TabsTrigger value="props">Props</TabsTrigger>
            <TabsTrigger value="hardways">Hard</TabsTrigger>
            <TabsTrigger value="side">Side</TabsTrigger>
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

          {/* Come Bets */}
          <TabsContent value="come" className="space-y-3 mt-4">
            <div className="text-xs text-muted-foreground p-2 bg-blue-500/10 border border-blue-500/20 rounded mb-3">
              <Info className="inline h-3 w-3 mr-1" />
              Come bets work like Pass Line. Place Come/Don't Come, then on next roll: 7/11 wins (loses DC), 2/3/12 loses (wins DC), point numbers move the bet to that point.
            </div>

            {/* Main Come/Don't Come Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={() => addComeBet(0)}
              >
                <Target className="h-4 w-4 mb-1" />
                <span className="text-xs font-bold">Come</span>
                <span className="text-[10px] text-muted-foreground">1:1 (like Pass)</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={() => addDontComeBet(0)}
              >
                <CircleDot className="h-4 w-4 mb-1" />
                <span className="text-xs font-bold">Don't Come</span>
                <span className="text-[10px] text-muted-foreground">1:1 (like DP)</span>
              </Button>
            </div>

            {/* Active Come Bets on Points */}
            {position?.comeBets.some(b => b > 0n) && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Come Bets on Points</span>
                <div className="grid grid-cols-3 gap-2">
                  {POINT_NUMBERS.map((point) => {
                    const idx = pointToIndex(point);
                    const hasCome = idx !== null && (position?.comeBets[idx] ?? 0n) > 0n;
                    const betAmount = hasCome && idx !== null
                      ? (Number(position.comeBets[idx]) / 1e9).toFixed(2)
                      : null;
                    if (!hasCome) return null;
                    return (
                      <div
                        key={`come-${point}`}
                        className="h-12 flex flex-col items-center justify-center p-2 bg-primary/10 border border-primary/30 rounded"
                      >
                        <span className="text-sm font-bold">{point}</span>
                        <span className="text-[10px] text-primary">{betAmount} CRAP</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Active Don't Come Bets on Points */}
            {position?.dontComeBets.some(b => b > 0n) && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Don't Come Bets on Points</span>
                <div className="grid grid-cols-3 gap-2">
                  {POINT_NUMBERS.map((point) => {
                    const idx = pointToIndex(point);
                    const hasDC = idx !== null && (position?.dontComeBets[idx] ?? 0n) > 0n;
                    const betAmount = hasDC && idx !== null
                      ? (Number(position.dontComeBets[idx]) / 1e9).toFixed(2)
                      : null;
                    if (!hasDC) return null;
                    return (
                      <div
                        key={`dc-${point}`}
                        className="h-12 flex flex-col items-center justify-center p-2 bg-red-500/10 border border-red-500/30 rounded"
                      >
                        <span className="text-sm font-bold">{point}</span>
                        <span className="text-[10px] text-red-500">{betAmount} CRAP</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Come Odds (only show if has Come bets) */}
            {position?.comeBets.some(b => b > 0n) && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Add Odds to Come Bets (0% edge)</span>
                <div className="grid grid-cols-3 gap-2">
                  {POINT_NUMBERS.map((point) => {
                    const idx = pointToIndex(point);
                    const hasCome = idx !== null && position.comeBets[idx] > 0n;
                    if (!hasCome) return null;
                    return (
                      <Button
                        key={`co-${point}`}
                        variant="secondary"
                        className="h-10 flex flex-col"
                        onClick={() => addComeOddsBet(point)}
                      >
                        <span className="text-sm font-bold">{point}</span>
                        <span className="text-[10px]">+ Odds</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Don't Come Odds */}
            {position?.dontComeBets.some(b => b > 0n) && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Lay Odds on Don't Come (0% edge)</span>
                <div className="grid grid-cols-3 gap-2">
                  {POINT_NUMBERS.map((point) => {
                    const idx = pointToIndex(point);
                    const hasDC = idx !== null && position.dontComeBets[idx] > 0n;
                    if (!hasDC) return null;
                    return (
                      <Button
                        key={`dco-${point}`}
                        variant="secondary"
                        className="h-10 flex flex-col"
                        onClick={() => addDontComeOddsBet(point)}
                      >
                        <span className="text-sm font-bold">{point}</span>
                        <span className="text-[10px]">+ Lay</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
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

          {/* Side Bets (Come-out only) */}
          <TabsContent value="side" className="space-y-3 mt-4">
            {!isComeOut && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-600 dark:text-yellow-400 mb-2">
                <Info className="inline h-4 w-4 mr-1" />
                Side bets can only be placed on come-out roll
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={handleAddFireBet}
                disabled={!isComeOut}
              >
                <span className="text-sm font-bold">Fire Bet</span>
                <span className="text-[10px] text-muted-foreground">4 pts: 24:1</span>
                <span className="text-[10px] text-muted-foreground">5 pts: 249:1, 6: 999:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={handleAddDiffDoubles}
                disabled={!isComeOut}
              >
                <span className="text-sm font-bold">Diff Doubles</span>
                <span className="text-[10px] text-muted-foreground">3: 4:1, 4: 8:1</span>
                <span className="text-[10px] text-muted-foreground">5: 15:1, 6: 100:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={handleAddRideTheLine}
                disabled={!isComeOut}
              >
                <span className="text-sm font-bold">Ride the Line</span>
                <span className="text-[10px] text-muted-foreground">Pass wins: 3-11+</span>
                <span className="text-[10px] text-muted-foreground">Up to 500:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={handleAddMugsyCorner}
                disabled={!isComeOut}
              >
                <span className="text-sm font-bold">Mugsy's Corner</span>
                <span className="text-[10px] text-muted-foreground">Comeout 7: 2:1</span>
                <span className="text-[10px] text-muted-foreground">Point 7: 3:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={handleAddHotHand}
                disabled={!isComeOut}
              >
                <span className="text-sm font-bold">Hot Hand</span>
                <span className="text-[10px] text-muted-foreground">Hit all totals</span>
                <span className="text-[10px] text-muted-foreground">9: 20:1, 10: 80:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-16 flex flex-col"
                onClick={handleAddReplayBet}
                disabled={!isComeOut}
              >
                <span className="text-sm font-bold">Replay Bet</span>
                <span className="text-[10px] text-muted-foreground">Same pt 3x+</span>
                <span className="text-[10px] text-muted-foreground">3: 8:1, 4: 80:1+</span>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground font-medium mt-3 mb-1">
              Fielder's Choice (single-roll)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddFieldersChoice(0)}
                disabled={!isComeOut}
              >
                <span className="text-xs font-bold">2,3,4</span>
                <span className="text-[10px] text-muted-foreground">4:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddFieldersChoice(1)}
                disabled={!isComeOut}
              >
                <span className="text-xs font-bold">4,9,10</span>
                <span className="text-[10px] text-muted-foreground">2:1</span>
              </Button>
              <Button
                variant="outline"
                className="h-14 flex flex-col"
                onClick={handleAddFieldersChoice(2)}
                disabled={!isComeOut}
              >
                <span className="text-xs font-bold">10,11,12</span>
                <span className="text-[10px] text-muted-foreground">4:1</span>
              </Button>
            </div>
            <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
              <Info className="inline h-3 w-3 mr-1" />
              Side bets are placed on come-out roll and persist until seven-out
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
                    <span className="font-mono">{bet.amount.toFixed(2)} CRAP</span>
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
              <span className={`font-mono ${hasInsufficientCrap ? 'text-red-500' : 'text-chart-2'}`}>
                {totalPending.toFixed(2)} CRAP
              </span>
            </div>
            {hasInsufficientCrap && (
              <div className="text-xs text-red-500 mt-1">
                Insufficient balance! You need {(totalPending - (crapBalance || 0)).toFixed(4)} more CRAP.
              </div>
            )}
          </div>
        )}

        {/* Submit Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleSubmitBets}
          disabled={!wallet.connected || isSubmitting || pendingBets.length === 0 || hasInsufficientCrap || crapBalance === 0}
        >
          {!wallet.connected ? (
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
              {totalPending.toFixed(2)} CRAP)
            </>
          )}
        </Button>

        {/* Settle Bets - for wallet users to settle their own bets */}
        {canSettle && (
          <>
            <Separator />
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-blue-500" />
                  <span className="text-sm">
                    {round?.winningSquare !== null ? "Round Complete" : "Ready to Roll"}
                  </span>
                </div>
                {round?.winningSquare !== null && round?.winningSquare !== undefined && (
                  <span className="font-mono text-xs text-muted-foreground">
                    Dice: {squareToDice(round.winningSquare).join(" + ")} ={" "}
                    {squareToDice(round.winningSquare).reduce((a, b) => a + b, 0)}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                {round?.winningSquare !== null
                  ? "Settle your bets to determine wins/losses based on the round result."
                  : isTestNetwork
                    ? "Generate a random roll and settle your bets on this test network."
                    : "Settle your bets to determine wins/losses."}
              </p>
              <Button
                className="w-full"
                variant="outline"
                onClick={handleSettleBets}
                disabled={!wallet.connected || isSettling}
              >
                {isSettling ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Settling...
                  </>
                ) : (
                  <>
                    <Dices className="mr-2 h-4 w-4" />
                    {round?.winningSquare !== null ? "Settle My Bets" : "Roll & Settle"}
                  </>
                )}
              </Button>
            </div>
          </>
        )}

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
                  {(Number(pendingWinnings) / Number(ONE_CRAP)).toFixed(4)} CRAP
                </span>
              </div>
              <Button
                className="w-full mt-2"
                variant="outline"
                onClick={handleClaimWinnings}
                disabled={!wallet.connected || isClaiming}
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
                  {(Number(position.totalWagered) / Number(ONE_CRAP)).toFixed(4)} CRAP
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Won</span>
                <span className="font-mono text-green-500">
                  {(Number(position.totalWon) / Number(ONE_CRAP)).toFixed(4)} CRAP
                </span>
              </div>
              <div className="flex justify-between">
                <span>Total Lost</span>
                <span className="font-mono text-red-500">
                  {(Number(position.totalLost) / Number(ONE_CRAP)).toFixed(4)} CRAP
                </span>
              </div>
              {Number(position.passLine) > 0 && (
                <div className="flex justify-between">
                  <span>Pass Line Bet</span>
                  <span className="font-mono text-yellow-500">
                    {(Number(position.passLine) / Number(ONE_CRAP)).toFixed(4)} CRAP
                  </span>
                </div>
              )}
              {Number(position.dontPass) > 0 && (
                <div className="flex justify-between">
                  <span>Don't Pass Bet</span>
                  <span className="font-mono text-yellow-500">
                    {(Number(position.dontPass) / Number(ONE_CRAP)).toFixed(4)} CRAP
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

export const CrapsBettingPanel = memo(CrapsBettingPanelComponent);
