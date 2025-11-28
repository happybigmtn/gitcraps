"use client";

import { useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  useGameStore,
  useSelectedSquareCount,
  useTotalDeployAmount,
} from "@/store/gameStore";
import { formatSol, solToLamports } from "@/lib/solana";
import { ALL_DICE_COMBINATIONS } from "@/lib/dice";
import { createDeployInstruction } from "@/lib/program";
import { useBoard } from "@/hooks/useBoard";
import { toast } from "sonner";
import { Rocket, Coins, Grid3X3, Dices, Loader2 } from "lucide-react";

interface DeployPanelProps {
  onDeploy?: () => void;
  disabled?: boolean;
  baseReward?: number; // Estimated base CRAP reward
}

export function DeployPanel({
  onDeploy,
  disabled = false,
  baseReward = 0.15,
}: DeployPanelProps) {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { board, loading: boardLoading, error: boardError } = useBoard();
  const {
    deployAmount,
    setDeployAmount,
    selectedSquares,
    selectAllSquares,
    clearSquares,
    isDeploying,
    setIsDeploying,
  } = useGameStore();

  const selectedCount = useSelectedSquareCount();
  const totalAmount = useTotalDeployAmount();

  // Calculate average multiplier based on selected combinations
  const getSelectionInfo = () => {
    const selectedCombos = selectedSquares
      .map((selected, index) => (selected ? ALL_DICE_COMBINATIONS[index] : null))
      .filter(Boolean);

    if (selectedCombos.length === 0) {
      return { avgMultiplier: 0, probability: 0 };
    }

    // Each combination has 1/36 probability
    const probability = selectedCombos.length / 36;
    // Average multiplier is 36 / number of combinations (fair payout)
    const avgMultiplier = 36 / selectedCombos.length;

    return { avgMultiplier, probability };
  };

  const { avgMultiplier, probability } = getSelectionInfo();
  const potentialReward = baseReward * avgMultiplier;

  const handleDeploy = useCallback(async () => {
    if (!publicKey || !connected) {
      toast.error("Please connect your wallet first");
      return;
    }

    if (selectedCount === 0) {
      toast.error("Please select at least one square");
      return;
    }

    if (totalAmount <= 0) {
      toast.error("Please enter a deploy amount");
      return;
    }

    if (!board) {
      toast.error("Board not loaded. Please wait and try again.");
      return;
    }

    try {
      setIsDeploying(true);
      toast.info("Preparing transaction...");

      // Convert SOL to lamports
      const amountLamports = BigInt(Math.floor(totalAmount * LAMPORTS_PER_SOL));

      // Build deploy instruction
      const deployIx = createDeployInstruction(
        publicKey,
        publicKey, // authority is same as signer
        amountLamports,
        board.roundId,
        selectedSquares
      );

      // Create transaction
      const transaction = new Transaction().add(deployIx);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send transaction
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

      toast.success(
        `Deployed ${formatSol(solToLamports(totalAmount))} SOL to ${selectedCount} squares!`
      );
      onDeploy?.();
    } catch (error) {
      console.error("Deploy error:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      if (errorMessage.includes("User rejected")) {
        toast.error("Transaction cancelled");
      } else {
        toast.error(`Failed to deploy: ${errorMessage}`);
      }
    } finally {
      setIsDeploying(false);
    }
  }, [
    publicKey,
    connected,
    selectedCount,
    totalAmount,
    board,
    selectedSquares,
    connection,
    sendTransaction,
    setIsDeploying,
    onDeploy,
  ]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Deploy SOL
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount">Amount per Square (SOL)</Label>
          <div className="flex gap-2">
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={deployAmount}
              onChange={(e) => setDeployAmount(parseFloat(e.target.value) || 0)}
              className="font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeployAmount(0.1)}
            >
              0.1
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeployAmount(0.5)}
            >
              0.5
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeployAmount(1)}
            >
              1
            </Button>
          </div>
        </div>

        {/* Quick Select */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={selectAllSquares}
            className="flex-1"
          >
            <Grid3X3 className="mr-2 h-4 w-4" />
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clearSquares}
            className="flex-1"
          >
            Clear
          </Button>
        </div>

        <Separator />

        {/* Summary */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Selected Combinations</span>
            <span className="font-mono font-bold">{selectedCount} / 36</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Deployment</span>
            <span className="font-mono font-bold text-chart-2">
              {totalAmount.toFixed(2)} SOL
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Dices className="h-4 w-4" />
              Win Probability
            </span>
            <span className="font-mono font-bold">
              {(probability * 100).toFixed(1)}%{" "}
              <span className="text-muted-foreground">
                ({avgMultiplier > 0 ? `${avgMultiplier.toFixed(1)}x` : "-"})
              </span>
            </span>
          </div>
        </div>

        <Separator />

        {/* Potential Reward */}
        <div className="p-3 bg-secondary/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-chart-1" />
              <span className="text-sm">Potential CRAP Reward</span>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-lg text-chart-1">
                {potentialReward.toFixed(2)} CRAP
              </div>
              <div className="text-xs text-muted-foreground">
                if dice matches prediction
              </div>
            </div>
          </div>
        </div>

        {/* Board Status */}
        {boardError && (
          <div className="text-sm text-destructive text-center p-2 bg-destructive/10 rounded">
            {boardError}
          </div>
        )}

        {/* Round Info */}
        {board && (
          <div className="text-xs text-muted-foreground text-center">
            Round #{board.roundId.toString()}
          </div>
        )}

        {/* Deploy Button */}
        <Button
          className="w-full"
          size="lg"
          onClick={handleDeploy}
          disabled={
            disabled || isDeploying || boardLoading || !connected || selectedCount === 0 || !board
          }
        >
          {!connected ? (
            "Connect Wallet"
          ) : boardLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading...
            </>
          ) : isDeploying ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Deploying...
            </>
          ) : (
            <>
              <Rocket className="mr-2 h-5 w-5" />
              Deploy {totalAmount.toFixed(2)} SOL
            </>
          )}
        </Button>

        {/* Disclaimer */}
        <p className="text-xs text-center text-muted-foreground">
          Mining rewards are based on dice roll probability. All predictions have
          equal expected value.
        </p>
      </CardContent>
    </Card>
  );
}
