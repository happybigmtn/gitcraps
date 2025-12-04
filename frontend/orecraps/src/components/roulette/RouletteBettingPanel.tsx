"use client";

/**
 * RouletteBettingPanel Component
 *
 * Provides roulette betting functionality with support for all bet types:
 * - Inside bets: Straight Up (single numbers)
 * - Outside bets: Red/Black, Odd/Even, Low/High, Dozens, Columns
 *
 * Uses wallet adapter for wallet state and TransactionService for transactions.
 */

import { useCallback, useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { ONE_ROUL, getRoulMint } from "@/lib/solana";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  useRouletteStore,
  useRouletteTotalPendingAmount,
  useRoulettePendingBetCount,
  getRouletteBetTypeName,
  hasActiveBets,
} from "@/store/rouletteStore";
import { useRoulette } from "@/hooks/useRoulette";
import { useNetworkStore } from "@/store/networkStore";
import { createTransactionService } from "@/services/transactionService";
import { toast } from "sonner";
import {
  Circle,
  Loader2,
  Trash2,
  Send,
  DollarSign,
  Info,
  CheckCircle2,
} from "lucide-react";

export function RouletteBettingPanel() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const {
    game,
    position,
    canPlaceBets,
    pendingWinnings,
    houseBankroll,
    epochId,
    refetch,
  } = useRoulette();
  const network = useNetworkStore((state) => state.network);

  const {
    betAmount,
    setBetAmount,
    pendingBets,
    removePendingBet,
    clearPendingBets,
  } = useRouletteStore();

  const totalPending = useRouletteTotalPendingAmount();
  const pendingCount = useRoulettePendingBetCount();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const [roulBalance, setRoulBalance] = useState<number | null>(null);

  // Fetch ROUL token balance when wallet changes
  useEffect(() => {
    async function fetchRoulBalance() {
      if (!wallet.publicKey || !wallet.connected) {
        setRoulBalance(null);
        return;
      }
      try {
        const roulMint = getRoulMint(network);
        const ata = await getAssociatedTokenAddress(roulMint, wallet.publicKey);
        const balance = await connection.getTokenAccountBalance(ata);
        setRoulBalance(Number(balance.value.uiAmount || 0));
      } catch {
        // Token account doesn't exist or other error
        setRoulBalance(0);
      }
    }
    fetchRoulBalance();
  }, [wallet.publicKey, wallet.connected, connection, network]);

  const hasInsufficientRoul = roulBalance !== null && totalPending > roulBalance;

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

    if (!canPlaceBets) {
      toast.error("Cannot place bets - spin in progress");
      return;
    }

    if (roulBalance === null || roulBalance === 0) {
      toast.error("You need ROUL tokens to place bets. Get ROUL tokens from the faucet.");
      return;
    }

    if (hasInsufficientRoul) {
      toast.error(
        `Insufficient ROUL balance. You have ${roulBalance?.toFixed(4)} ROUL but need ${totalPending.toFixed(4)} ROUL`
      );
      return;
    }

    try {
      setIsSubmitting(true);
      toast.info("Preparing transaction...");

      const txService = createTransactionService();
      const bets = pendingBets.map((bet) => ({
        betType: bet.betType,
        betIndex: bet.betIndex,
        amount: bet.amount,
      }));

      toast.info("Please confirm in your wallet...");
      const result = await txService.placeRouletteBets(wallet, connection, bets);

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      toast.success(`Placed ${result.betsPlaced} bet(s) successfully!`);
      clearPendingBets();
      refetch();

      // Refresh ROUL balance after placing bets
      if (wallet.publicKey) {
        try {
          const roulMint = getRoulMint(network);
          const ata = await getAssociatedTokenAddress(roulMint, wallet.publicKey);
          const balance = await connection.getTokenAccountBalance(ata);
          setRoulBalance(Number(balance.value.uiAmount || 0));
        } catch {
          setRoulBalance(0);
        }
      }
    } catch (error) {
      console.error("Submit bets error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
    roulBalance,
    hasInsufficientRoul,
    totalPending,
    network,
    canPlaceBets,
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

      const txService = createTransactionService();

      toast.info("Please confirm in your wallet...");
      const result = await txService.claimRouletteWinnings(wallet, connection);

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      const winAmount = Number(pendingWinnings) / Number(ONE_ROUL);
      toast.success(`Claimed ${winAmount.toFixed(4)} ROUL!`);
      refetch();
    } catch (error) {
      console.error("Claim error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to claim: ${errorMessage}`);
    } finally {
      setIsClaiming(false);
    }
  }, [wallet, pendingWinnings, connection, refetch]);

  // Spin the wheel (settle bets)
  const handleSpin = useCallback(async () => {
    if (!wallet.publicKey || !wallet.connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (!position || !hasActiveBets(position)) {
      toast.error("No active bets to settle. Place bets first.");
      return;
    }

    try {
      setIsSpinning(true);
      toast.info("Spinning the wheel...");

      const txService = createTransactionService();

      toast.info("Please confirm in your wallet...");
      const result = await txService.settleRoulette(wallet, connection);

      if (!result.success) {
        throw new Error(result.error || "Transaction failed");
      }

      toast.success("Wheel spun! Check your result.");

      // Small delay to allow on-chain state to propagate
      await new Promise((resolve) => setTimeout(resolve, 500));
      refetch();
    } catch (error) {
      console.error("Spin error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to spin: ${errorMessage}`);
    } finally {
      setIsSpinning(false);
    }
  }, [wallet, position, connection, refetch]);

  // Bet amount handlers
  const handleSetAmount001 = useCallback(() => setBetAmount(0.01), [setBetAmount]);
  const handleSetAmount01 = useCallback(() => setBetAmount(0.1), [setBetAmount]);
  const handleSetAmount1 = useCallback(() => setBetAmount(1), [setBetAmount]);

  const handleBetAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value);
      // Validate: non-negative, max 10000 ROUL per bet, no NaN
      if (isNaN(value) || value < 0) {
        setBetAmount(0);
      } else if (value > 10000) {
        setBetAmount(10000);
      } else {
        setBetAmount(value);
      }
    },
    [setBetAmount]
  );

  const handleRemovePendingBet = useCallback(
    (index: number) => () => {
      removePendingBet(index);
    },
    [removePendingBet]
  );

  const houseBankrollRoul = Number(houseBankroll) / Number(ONE_ROUL);
  const positionHasActiveBets = hasActiveBets(position);

  // Elegant empty state when game is not initialized
  if (!game) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Circle className="h-5 w-5" />
            <span>Roulette Bets</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
              <Circle className="relative h-16 w-16 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium mb-2">Roulette game not initialized</h3>
            <p className="text-sm text-muted-foreground max-w-[240px] mb-6">
              The roulette table is being set up. Connect to a network with an active game to start betting.
            </p>
            <Button variant="outline" size="sm" disabled>
              <Circle className="mr-2 h-4 w-4" />
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
            <Circle className="h-5 w-5" />
            <span>Roulette Bets</span>
          </div>
          <Badge variant={canPlaceBets ? "default" : "secondary"}>
            {canPlaceBets ? "Place Bets" : "Spin in Progress"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Game Status */}
        <div className="flex justify-between text-sm text-muted-foreground bg-secondary/30 rounded-lg px-3 py-2">
          <span>Epoch #{epochId.toString()}</span>
          <span className="font-mono">{houseBankrollRoul.toFixed(2)} ROUL</span>
        </div>

        {/* ROUL Balance Display */}
        {wallet.connected && roulBalance !== null && (
          <div
            className={`flex justify-between text-sm px-3 py-2 rounded-lg ${
              roulBalance === 0
                ? "bg-red-500/10 border border-red-500/20"
                : "bg-secondary/30"
            }`}
          >
            <span className="text-muted-foreground">Your ROUL Balance</span>
            <span
              className={`font-mono font-bold ${
                roulBalance === 0
                  ? "text-red-500"
                  : hasInsufficientRoul
                  ? "text-yellow-500"
                  : "text-green-500"
              }`}
            >
              {roulBalance.toFixed(4)} ROUL
            </span>
          </div>
        )}

        {/* No ROUL Warning */}
        {wallet.connected && roulBalance === 0 && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-600 dark:text-red-400">
            <Info className="inline h-4 w-4 mr-1" />
            You don't have any ROUL tokens. Get some from the faucet.
          </div>
        )}

        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="bet-amount">Bet Amount (ROUL)</Label>
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

        {/* Quick Bet Buttons Info */}
        <div className="text-xs text-muted-foreground p-2 bg-secondary/50 rounded">
          <Info className="inline h-3 w-3 mr-1" />
          Click numbers on the table or use the outside bet buttons to add bets. Each click adds a bet at the current amount.
        </div>

        <Separator />

        {/* Pending Bets */}
        {pendingBets.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Pending Bets ({pendingCount})</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearPendingBets}
                className="h-6 px-2 text-xs"
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Clear All
              </Button>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {pendingBets.map((bet, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm bg-secondary/50 rounded px-2 py-1"
                >
                  <span>{getRouletteBetTypeName(bet.betType, bet.betIndex)}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{bet.amount.toFixed(4)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemovePendingBet(index)}
                      className="h-5 w-5 p-0"
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-sm font-medium pt-1">
              <span>Total</span>
              <span
                className={`font-mono ${hasInsufficientRoul ? "text-red-500" : ""}`}
              >
                {totalPending.toFixed(4)} ROUL
              </span>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Submit Bets Button */}
          {pendingBets.length > 0 && (
            <Button
              className="w-full"
              onClick={handleSubmitBets}
              disabled={
                isSubmitting ||
                !wallet.connected ||
                hasInsufficientRoul ||
                !canPlaceBets
              }
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Submit {pendingCount} Bet{pendingCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}

          {/* Spin Button */}
          {positionHasActiveBets && (
            <Button
              variant="secondary"
              className="w-full"
              onClick={handleSpin}
              disabled={isSpinning || !wallet.connected}
            >
              {isSpinning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Spinning...
                </>
              ) : (
                <>
                  <Circle className="mr-2 h-4 w-4" />
                  Spin the Wheel
                </>
              )}
            </Button>
          )}

          {/* Claim Winnings Button */}
          {pendingWinnings > 0n && (
            <Button
              variant="default"
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleClaimWinnings}
              disabled={isClaiming || !wallet.connected}
            >
              {isClaiming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Claiming...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Claim {(Number(pendingWinnings) / Number(ONE_ROUL)).toFixed(4)} ROUL
                </>
              )}
            </Button>
          )}
        </div>

        {/* Active Position Display */}
        {position && positionHasActiveBets && (
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Active Bets on Epoch #{position.epochId.toString()}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {position.red > 0n && (
                <div className="flex justify-between">
                  <span className="text-red-500">Red</span>
                  <span className="font-mono">
                    {(Number(position.red) / 1e9).toFixed(4)}
                  </span>
                </div>
              )}
              {position.black > 0n && (
                <div className="flex justify-between">
                  <span>Black</span>
                  <span className="font-mono">
                    {(Number(position.black) / 1e9).toFixed(4)}
                  </span>
                </div>
              )}
              {position.odd > 0n && (
                <div className="flex justify-between">
                  <span>Odd</span>
                  <span className="font-mono">
                    {(Number(position.odd) / 1e9).toFixed(4)}
                  </span>
                </div>
              )}
              {position.even > 0n && (
                <div className="flex justify-between">
                  <span>Even</span>
                  <span className="font-mono">
                    {(Number(position.even) / 1e9).toFixed(4)}
                  </span>
                </div>
              )}
              {position.low > 0n && (
                <div className="flex justify-between">
                  <span>1-18</span>
                  <span className="font-mono">
                    {(Number(position.low) / 1e9).toFixed(4)}
                  </span>
                </div>
              )}
              {position.high > 0n && (
                <div className="flex justify-between">
                  <span>19-36</span>
                  <span className="font-mono">
                    {(Number(position.high) / 1e9).toFixed(4)}
                  </span>
                </div>
              )}
              {position.dozens.some((d) => d > 0n) && (
                <>
                  {position.dozens[0] > 0n && (
                    <div className="flex justify-between">
                      <span>1st Dozen</span>
                      <span className="font-mono">
                        {(Number(position.dozens[0]) / 1e9).toFixed(4)}
                      </span>
                    </div>
                  )}
                  {position.dozens[1] > 0n && (
                    <div className="flex justify-between">
                      <span>2nd Dozen</span>
                      <span className="font-mono">
                        {(Number(position.dozens[1]) / 1e9).toFixed(4)}
                      </span>
                    </div>
                  )}
                  {position.dozens[2] > 0n && (
                    <div className="flex justify-between">
                      <span>3rd Dozen</span>
                      <span className="font-mono">
                        {(Number(position.dozens[2]) / 1e9).toFixed(4)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {position.columns.some((c) => c > 0n) && (
                <>
                  {position.columns[0] > 0n && (
                    <div className="flex justify-between">
                      <span>1st Column</span>
                      <span className="font-mono">
                        {(Number(position.columns[0]) / 1e9).toFixed(4)}
                      </span>
                    </div>
                  )}
                  {position.columns[1] > 0n && (
                    <div className="flex justify-between">
                      <span>2nd Column</span>
                      <span className="font-mono">
                        {(Number(position.columns[1]) / 1e9).toFixed(4)}
                      </span>
                    </div>
                  )}
                  {position.columns[2] > 0n && (
                    <div className="flex justify-between">
                      <span>3rd Column</span>
                      <span className="font-mono">
                        {(Number(position.columns[2]) / 1e9).toFixed(4)}
                      </span>
                    </div>
                  )}
                </>
              )}
              {/* Show straight up bets if any */}
              {position.straightUp.some((s) => s > 0n) && (
                <div className="col-span-2 mt-1 pt-1 border-t">
                  <span className="text-muted-foreground">Straight Up:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {position.straightUp.map((amount, idx) =>
                      amount > 0n ? (
                        <span key={idx} className="text-xs bg-secondary px-1 rounded">
                          {idx === 37 ? "00" : idx}: {(Number(amount) / 1e9).toFixed(2)}
                        </span>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RouletteBettingPanel;
