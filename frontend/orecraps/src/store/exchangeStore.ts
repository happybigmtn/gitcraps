/**
 * Exchange Store - State management for RNG/SOL and RNG/Game Token swaps
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  LiquidityPool,
  SwapQuote,
  GameTokenKey,
  GAME_TOKENS,
} from "@/services/ExchangeService";
import { ONE_RNG } from "@/lib/solana";

interface ExchangeState {
  // Pool state
  pool: LiquidityPool | null;
  isPoolLoading: boolean;
  poolError: string | null;

  // Current swap state
  swapDirection: "SOL_TO_RNG" | "RNG_TO_SOL" | "RNG_TO_GAME" | "GAME_TO_RNG";
  selectedGameToken: GameTokenKey | null;
  inputAmount: string;
  outputAmount: string;
  currentQuote: SwapQuote | null;
  slippageTolerance: number; // in basis points (100 = 1%)

  // Transaction state
  isSwapping: boolean;
  lastSwapTx: string | null;
  swapError: string | null;

  // Staker rewards
  stakerRewards: bigint;

  // Actions
  setPool: (pool: LiquidityPool | null) => void;
  setPoolLoading: (loading: boolean) => void;
  setPoolError: (error: string | null) => void;
  setSwapDirection: (direction: ExchangeState["swapDirection"]) => void;
  setSelectedGameToken: (token: GameTokenKey | null) => void;
  setInputAmount: (amount: string) => void;
  setOutputAmount: (amount: string) => void;
  setCurrentQuote: (quote: SwapQuote | null) => void;
  setSlippageTolerance: (bps: number) => void;
  setIsSwapping: (swapping: boolean) => void;
  setLastSwapTx: (tx: string | null) => void;
  setSwapError: (error: string | null) => void;
  setStakerRewards: (rewards: bigint) => void;
  resetSwap: () => void;
}

export const useExchangeStore = create<ExchangeState>()(
  persist(
    (set) => ({
      // Initial state
      pool: null,
      isPoolLoading: false,
      poolError: null,
      swapDirection: "SOL_TO_RNG",
      selectedGameToken: null,
      inputAmount: "",
      outputAmount: "",
      currentQuote: null,
      slippageTolerance: 100, // 1% default
      isSwapping: false,
      lastSwapTx: null,
      swapError: null,
      stakerRewards: 0n,

      // Actions
      setPool: (pool) => set({ pool, poolError: null }),
      setPoolLoading: (loading) => set({ isPoolLoading: loading }),
      setPoolError: (error) => set({ poolError: error }),
      setSwapDirection: (direction) =>
        set({ swapDirection: direction, inputAmount: "", outputAmount: "", currentQuote: null }),
      setSelectedGameToken: (token) => set({ selectedGameToken: token }),
      setInputAmount: (amount) => set({ inputAmount: amount }),
      setOutputAmount: (amount) => set({ outputAmount: amount }),
      setCurrentQuote: (quote) => set({ currentQuote: quote }),
      setSlippageTolerance: (bps) => set({ slippageTolerance: bps }),
      setIsSwapping: (swapping) => set({ isSwapping: swapping }),
      setLastSwapTx: (tx) => set({ lastSwapTx: tx }),
      setSwapError: (error) => set({ swapError: error }),
      setStakerRewards: (rewards) => set({ stakerRewards: rewards }),
      resetSwap: () =>
        set({
          inputAmount: "",
          outputAmount: "",
          currentQuote: null,
          swapError: null,
        }),
    }),
    {
      name: "orecraps-exchange-store",
      partialize: (state) => ({
        slippageTolerance: state.slippageTolerance,
        swapDirection: state.swapDirection,
      }),
    }
  )
);

// ============================================================================
// SELECTORS
// ============================================================================

export const usePool = () => useExchangeStore((s) => s.pool);
export const usePoolLoading = () => useExchangeStore((s) => s.isPoolLoading);
export const usePoolError = () => useExchangeStore((s) => s.poolError);
export const useSwapDirection = () => useExchangeStore((s) => s.swapDirection);
export const useSelectedGameToken = () => useExchangeStore((s) => s.selectedGameToken);
export const useInputAmount = () => useExchangeStore((s) => s.inputAmount);
export const useOutputAmount = () => useExchangeStore((s) => s.outputAmount);
export const useCurrentQuote = () => useExchangeStore((s) => s.currentQuote);
export const useSlippageTolerance = () => useExchangeStore((s) => s.slippageTolerance);
export const useIsSwapping = () => useExchangeStore((s) => s.isSwapping);
export const useSwapError = () => useExchangeStore((s) => s.swapError);
export const useStakerRewards = () => useExchangeStore((s) => s.stakerRewards);

// Pool stats selectors
export const usePoolPrice = () =>
  useExchangeStore((s) => {
    if (!s.pool || s.pool.solReserve === 0n) return 0;
    return Number(s.pool.rngReserve) / Number(s.pool.solReserve);
  });

export const usePoolSolReserve = () =>
  useExchangeStore((s) => (s.pool ? Number(s.pool.solReserve) / 1e9 : 0));

export const usePoolRngReserve = () =>
  useExchangeStore((s) => (s.pool ? Number(s.pool.rngReserve) / Number(ONE_RNG) : 0));

export const usePoolTotalFees = () =>
  useExchangeStore((s) => (s.pool ? Number(s.pool.totalFeesCollected) / 1e9 : 0));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function formatTokenAmount(amount: bigint, decimals: number = 9): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

export function parseTokenAmount(amount: string, decimals: number = 9): bigint {
  if (!amount || amount === "") return 0n;
  const [whole, fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return BigInt(whole || "0") * BigInt(10 ** decimals) + BigInt(paddedFraction);
}

export function getGameTokenInfo(key: GameTokenKey) {
  return GAME_TOKENS[key];
}

export function getAllGameTokens(): Array<{ key: GameTokenKey; info: typeof GAME_TOKENS[GameTokenKey] }> {
  return Object.entries(GAME_TOKENS).map(([key, info]) => ({
    key: key as GameTokenKey,
    info,
  }));
}
