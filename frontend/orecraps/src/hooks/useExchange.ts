"use client";

/**
 * useExchange Hook - On-chain exchange operations for RNG/SOL and RNG/Game Token swaps
 *
 * ALL SWAPS ARE EXECUTED ON-CHAIN - NO SIMULATIONS
 */

import { useCallback, useEffect, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  useExchangeStore,
  parseTokenAmount,
  formatTokenAmount,
} from "@/store/exchangeStore";
import {
  getExchangeService,
  GameTokenKey,
  SwapQuote,
  LiquidityPool,
} from "@/services/ExchangeService";
import { ONE_RNG } from "@/lib/solana";

export function useExchange() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();

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
    stakerRewards,
    setPool,
    setPoolLoading,
    setPoolError,
    setSwapDirection,
    setSelectedGameToken,
    setInputAmount,
    setOutputAmount,
    setCurrentQuote,
    setSlippageTolerance,
    setIsSwapping,
    setSwapError,
    setStakerRewards,
    resetSwap,
  } = useExchangeStore();

  const exchangeService = useMemo(
    () => getExchangeService(connection),
    [connection]
  );

  // Load pool state from chain
  const loadPool = useCallback(async () => {
    setPoolLoading(true);
    try {
      const chainPool = await exchangeService.fetchPoolFromChain();
      if (chainPool) {
        setPool(chainPool);
        console.log("Loaded pool from chain:", chainPool);
      } else {
        setPool(null);
        console.log("No pool found on chain");
      }
    } catch (error) {
      console.error("Error loading pool:", error);
      setPoolError(error instanceof Error ? error.message : "Failed to load pool");
    } finally {
      setPoolLoading(false);
    }
  }, [exchangeService, setPool, setPoolLoading, setPoolError]);

  // Get quote based on current swap direction (uses pool state)
  const getQuote = useCallback(
    (amount: string): SwapQuote | null => {
      if (!amount || parseFloat(amount) <= 0 || !pool) return null;

      try {
        const amountBigInt = parseTokenAmount(amount);

        switch (swapDirection) {
          case "SOL_TO_RNG":
            return exchangeService.quoteSolToRng(amountBigInt, pool);
          case "RNG_TO_SOL":
            return exchangeService.quoteRngToSol(amountBigInt, pool);
          case "RNG_TO_GAME":
            if (!selectedGameToken) return null;
            return exchangeService.quoteRngToGameToken(amountBigInt);
          case "GAME_TO_RNG":
            if (!selectedGameToken) return null;
            return exchangeService.quoteGameTokenToRng(amountBigInt);
          default:
            return null;
        }
      } catch (error) {
        console.error("Quote error:", error);
        return null;
      }
    },
    [swapDirection, selectedGameToken, exchangeService, pool]
  );

  // Update quote when input changes
  useEffect(() => {
    const quote = getQuote(inputAmount);
    setCurrentQuote(quote);
    if (quote) {
      setOutputAmount(formatTokenAmount(quote.outputAmount));
    } else {
      setOutputAmount("");
    }
  }, [inputAmount, getQuote, setCurrentQuote, setOutputAmount]);

  // Execute swap - SENDS REAL ON-CHAIN TRANSACTION
  const executeSwap = useCallback(async () => {
    if (!publicKey) {
      setSwapError("Wallet not connected");
      return { success: false, error: "Wallet not connected" };
    }

    if (!currentQuote || !inputAmount) {
      setSwapError("Invalid swap parameters");
      return { success: false, error: "Invalid swap parameters" };
    }

    setIsSwapping(true);
    setSwapError(null);

    try {
      const inputBigInt = parseTokenAmount(inputAmount);
      const minOutput = (currentQuote.outputAmount * BigInt(10000 - slippageTolerance)) / 10000n;

      let tx;

      switch (swapDirection) {
        case "SOL_TO_RNG":
          tx = await exchangeService.buildSwapSolToRngTransaction(
            publicKey,
            inputBigInt,
            minOutput
          );
          break;
        case "RNG_TO_SOL":
          tx = await exchangeService.buildSwapRngToSolTransaction(
            publicKey,
            inputBigInt,
            minOutput
          );
          break;
        case "RNG_TO_GAME":
          if (!selectedGameToken) {
            throw new Error("No game token selected");
          }
          tx = await exchangeService.buildSwapRngToGameTokenTransaction(
            publicKey,
            inputBigInt,
            selectedGameToken
          );
          break;
        case "GAME_TO_RNG":
          if (!selectedGameToken) {
            throw new Error("No game token selected");
          }
          tx = await exchangeService.buildSwapGameTokenToRngTransaction(
            publicKey,
            inputBigInt,
            selectedGameToken
          );
          break;
        default:
          throw new Error("Invalid swap direction");
      }

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Send transaction through wallet
      console.log("Sending swap transaction...");
      const signature = await sendTransaction(tx, connection);
      console.log("Transaction sent:", signature);

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }

      console.log("Swap confirmed:", signature);

      // Reload pool state after successful swap
      await loadPool();
      resetSwap();

      return { success: true, signature };
    } catch (error) {
      console.error("Swap error:", error);
      const message = error instanceof Error ? error.message : "Swap failed";
      setSwapError(message);
      return { success: false, error: message };
    } finally {
      setIsSwapping(false);
    }
  }, [
    publicKey,
    currentQuote,
    inputAmount,
    swapDirection,
    selectedGameToken,
    slippageTolerance,
    exchangeService,
    connection,
    sendTransaction,
    loadPool,
    resetSwap,
    setIsSwapping,
    setSwapError,
  ]);

  // Computed values
  const poolPrice = useMemo(() => {
    if (!pool || pool.solReserve === 0n) return 0;
    return Number(pool.rngReserve) / Number(pool.solReserve);
  }, [pool]);

  const poolTvlSol = useMemo(() => {
    if (!pool) return 0;
    const solValue = Number(pool.solReserve) / 1e9;
    const rngInSol = poolPrice > 0 ? (Number(pool.rngReserve) / Number(ONE_RNG)) / poolPrice : 0;
    return solValue + rngInSol;
  }, [pool, poolPrice]);

  return {
    // State
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
    stakerRewards,

    // Computed
    poolPrice,
    poolTvlSol,
    hasPool: pool !== null && pool.lpTokenSupply > 0n,

    // Actions
    loadPool,
    setSwapDirection,
    setSelectedGameToken,
    setInputAmount,
    setSlippageTolerance,
    executeSwap,
    resetSwap,
  };
}
