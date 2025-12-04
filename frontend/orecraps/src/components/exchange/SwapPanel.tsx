"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExchange } from "@/hooks/useExchange";
import { getAllGameTokens, formatTokenAmount } from "@/store/exchangeStore";
import { GameTokenKey, SWAP_FEE_BPS } from "@/services/ExchangeService";
import { ONE_RNG } from "@/lib/solana";
import {
  ArrowDownUp,
  Coins,
  Wallet,
  TrendingUp,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";

export function SwapPanel() {
  const {
    pool,
    isPoolLoading,
    poolError,
    swapDirection,
    selectedGameToken,
    inputAmount,
    outputAmount,
    currentQuote,
    slippageTolerance,
    isSwapping,
    swapError,
    hasPool,
    poolPrice,
    poolTvlSol,
    loadPool,
    setSwapDirection,
    setSelectedGameToken,
    setInputAmount,
    executeSwap,
    resetSwap,
  } = useExchange();

  const [activeTab, setActiveTab] = useState<"sol-rng" | "rng-game">("sol-rng");
  const gameTokens = getAllGameTokens();

  // Load pool on mount
  useEffect(() => {
    loadPool();
  }, [loadPool]);

  // Handle swap direction toggle
  const toggleDirection = () => {
    if (activeTab === "sol-rng") {
      setSwapDirection(swapDirection === "SOL_TO_RNG" ? "RNG_TO_SOL" : "SOL_TO_RNG");
    } else {
      setSwapDirection(swapDirection === "RNG_TO_GAME" ? "GAME_TO_RNG" : "RNG_TO_GAME");
    }
    resetSwap();
  };

  // Handle tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab as "sol-rng" | "rng-game");
    if (tab === "sol-rng") {
      setSwapDirection("SOL_TO_RNG");
    } else {
      setSwapDirection("RNG_TO_GAME");
    }
    resetSwap();
  };

  // Get input token name
  const getInputToken = () => {
    switch (swapDirection) {
      case "SOL_TO_RNG":
        return "SOL";
      case "RNG_TO_SOL":
      case "RNG_TO_GAME":
        return "RNG";
      case "GAME_TO_RNG":
        return selectedGameToken || "Token";
    }
  };

  // Get output token name
  const getOutputToken = () => {
    switch (swapDirection) {
      case "SOL_TO_RNG":
      case "GAME_TO_RNG":
        return "RNG";
      case "RNG_TO_SOL":
        return "SOL";
      case "RNG_TO_GAME":
        return selectedGameToken || "Token";
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDownUp className="h-5 w-5" />
            Token Exchange
          </div>
          <Badge variant="outline" className="text-xs">
            {SWAP_FEE_BPS / 100}% Fee
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pool Not Found */}
        {!hasPool && !isPoolLoading && (
          <div className="text-center py-6 space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="font-medium">Liquidity Pool Not Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                The RNG/SOL pool has not been initialized on-chain yet.
              </p>
            </div>
            <Button onClick={loadPool} variant="outline" className="w-full">
              Refresh Pool State
            </Button>
          </div>
        )}

        {/* Pool Stats */}
        {hasPool && (
          <div className="grid grid-cols-3 gap-2 p-3 bg-secondary/50 rounded-lg text-center">
            <div>
              <div className="text-xs text-muted-foreground">SOL Reserve</div>
              <div className="font-mono text-sm">
                {pool ? (Number(pool.solReserve) / 1e9).toFixed(2) : "0"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">RNG Reserve</div>
              <div className="font-mono text-sm">
                {pool ? (Number(pool.rngReserve) / Number(ONE_RNG)).toFixed(2) : "0"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">TVL (SOL)</div>
              <div className="font-mono text-sm">{poolTvlSol.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* Swap Tabs */}
        {hasPool && (
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="sol-rng">SOL ↔ RNG</TabsTrigger>
              <TabsTrigger value="rng-game">RNG ↔ Game</TabsTrigger>
            </TabsList>

            <TabsContent value="sol-rng" className="space-y-4 mt-4">
              {/* Input */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  You Pay ({getInputToken()})
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="pr-16 font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {getInputToken()}
                  </span>
                </div>
              </div>

              {/* Swap Direction Toggle */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleDirection}
                  className="rounded-full hover:bg-primary/10"
                >
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </div>

              {/* Output */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  You Receive ({getOutputToken()})
                </Label>
                <div className="relative">
                  <Input
                    type="text"
                    placeholder="0.00"
                    value={outputAmount}
                    readOnly
                    className="pr-16 font-mono bg-secondary/30"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    {getOutputToken()}
                  </span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="rng-game" className="space-y-4 mt-4">
              {/* Game Token Selector */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Select Game Token</Label>
                <Select
                  value={selectedGameToken || ""}
                  onValueChange={(v) => setSelectedGameToken(v as GameTokenKey)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select token..." />
                  </SelectTrigger>
                  <SelectContent>
                    {gameTokens.map(({ key, info }) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <Coins className="h-4 w-4" />
                          <span>{info.name}</span>
                          <span className="text-muted-foreground text-xs">({info.game})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Input */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  You Pay ({getInputToken()})
                </Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(e.target.value)}
                  className="font-mono"
                  disabled={!selectedGameToken}
                />
              </div>

              {/* Swap Direction Toggle */}
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleDirection}
                  className="rounded-full hover:bg-primary/10"
                  disabled={!selectedGameToken}
                >
                  <ArrowDownUp className="h-4 w-4" />
                </Button>
              </div>

              {/* Output */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  You Receive ({getOutputToken()})
                </Label>
                <Input
                  type="text"
                  placeholder="0.00"
                  value={outputAmount}
                  readOnly
                  className="font-mono bg-secondary/30"
                />
              </div>
            </TabsContent>
          </Tabs>
        )}

        {/* Quote Details */}
        {currentQuote && (
          <div className="p-3 bg-secondary/30 rounded-lg space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate</span>
              <span className="font-mono">
                1 {getInputToken()} = {currentQuote.rate.toFixed(6)} {getOutputToken()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fee (1%)</span>
              <span className="font-mono text-yellow-500">
                {formatTokenAmount(currentQuote.fee)} {getInputToken()}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">→ To Stakers (50%)</span>
              <span className="font-mono text-green-500">
                {formatTokenAmount(currentQuote.feeToStakers)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">→ Buy RNG (50%)</span>
              <span className="font-mono text-blue-500">
                {formatTokenAmount(currentQuote.feeToBuyback)}
              </span>
            </div>
            {currentQuote.priceImpact > 0.1 && (
              <div className="flex justify-between text-yellow-500">
                <span>Price Impact</span>
                <span className="font-mono">{currentQuote.priceImpact.toFixed(2)}%</span>
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {swapError && (
          <div className="p-3 bg-destructive/10 rounded-lg flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{swapError}</span>
          </div>
        )}

        {/* Swap Button */}
        {hasPool && (
          <Button
            className="w-full"
            onClick={executeSwap}
            disabled={
              isSwapping ||
              !inputAmount ||
              parseFloat(inputAmount) <= 0 ||
              !currentQuote ||
              (activeTab === "rng-game" && !selectedGameToken)
            }
          >
            {isSwapping ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Swapping...
              </>
            ) : (
              <>
                <ArrowDownUp className="mr-2 h-4 w-4" />
                Swap {getInputToken()} → {getOutputToken()}
              </>
            )}
          </Button>
        )}

        {/* Fee Info */}
        <div className="flex items-start gap-2 p-2 text-xs text-muted-foreground bg-secondary/20 rounded">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            1% fee on all swaps: 50% distributed to RNG stakers, 50% used to buy RNG
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default SwapPanel;
