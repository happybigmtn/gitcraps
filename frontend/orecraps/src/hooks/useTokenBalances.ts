"use client";

import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  RNG_MINT,
  CRAP_MINT,
  CARAT_MINT,
  ROUL_MINT,
  WAR_MINT,
  SICO_MINT,
  TCP_MINT,
  VPK_MINT,
  UTH_MINT,
  BJ_MINT,
} from "@/lib/solana";

export type GameToken = "RNG" | "CRAP" | "CARAT" | "ROUL" | "WAR" | "SICO" | "TCP" | "VPK" | "UTH" | "BJ";

// Map game tokens to their mint addresses
const TOKEN_MINTS: Record<GameToken, PublicKey> = {
  RNG: RNG_MINT,
  CRAP: CRAP_MINT,
  CARAT: CARAT_MINT,
  ROUL: ROUL_MINT,
  WAR: WAR_MINT,
  SICO: SICO_MINT,
  TCP: TCP_MINT,
  VPK: VPK_MINT,
  UTH: UTH_MINT,
  BJ: BJ_MINT,
};

// Map active tabs to their game tokens
export const TAB_TO_TOKEN: Record<string, GameToken> = {
  mine: "RNG",
  craps: "CRAP",
  baccarat: "CARAT",
  roulette: "ROUL",
  blackjack: "BJ",
  war: "WAR",
  sicbo: "SICO",
  threecard: "TCP",
  videopoker: "VPK",
  uth: "UTH",
};

// Display names for tokens
export const TOKEN_DISPLAY_NAMES: Record<GameToken, string> = {
  RNG: "RNG",
  CRAP: "CRAP",
  CARAT: "CARAT",
  ROUL: "ROUL",
  WAR: "WAR",
  SICO: "SICO",
  TCP: "TCP",
  VPK: "VPK",
  UTH: "UTH",
  BJ: "BJ",
};

export interface TokenBalance {
  symbol: GameToken;
  balance: bigint;
  decimals: number;
  formatted: string;
}

export interface UseTokenBalancesResult {
  balances: Record<GameToken, TokenBalance | null>;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  getRngBalance: () => TokenBalance | null;
  getGameTokenBalance: (tab: string) => TokenBalance | null;
}

function formatBalance(balance: bigint, decimals: number): string {
  const divisor = BigInt(10 ** decimals);
  const whole = balance / divisor;
  const fraction = balance % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 4);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

export function useTokenBalances(): UseTokenBalancesResult {
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balances, setBalances] = useState<Record<GameToken, TokenBalance | null>>({
    RNG: null,
    CRAP: null,
    CARAT: null,
    ROUL: null,
    WAR: null,
    SICO: null,
    TCP: null,
    VPK: null,
    UTH: null,
    BJ: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalances = useCallback(async () => {
    if (!publicKey || !connected) {
      setBalances({
        RNG: null,
        CRAP: null,
        CARAT: null,
        ROUL: null,
        WAR: null,
        SICO: null,
        TCP: null,
        VPK: null,
        UTH: null,
        BJ: null,
      });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newBalances: Record<GameToken, TokenBalance | null> = {
        RNG: null,
        CRAP: null,
        CARAT: null,
        ROUL: null,
        WAR: null,
        SICO: null,
        TCP: null,
        VPK: null,
        UTH: null,
        BJ: null,
      };

      // Fetch all balances in parallel
      const tokens = Object.entries(TOKEN_MINTS) as [GameToken, PublicKey][];
      const results = await Promise.allSettled(
        tokens.map(async ([symbol, mint]) => {
          try {
            const ata = getAssociatedTokenAddressSync(mint, publicKey);
            const accountInfo = await connection.getAccountInfo(ata);

            if (accountInfo && accountInfo.data.length >= 72) {
              // SPL token account layout: amount is at offset 64, 8 bytes
              const data = accountInfo.data;
              const amount = data.readBigUInt64LE(64);
              return {
                symbol,
                balance: amount,
                decimals: 9, // All our tokens use 9 decimals
                formatted: formatBalance(amount, 9),
              };
            }
            return null;
          } catch {
            return null;
          }
        })
      );

      results.forEach((result, index) => {
        const [symbol] = tokens[index];
        if (result.status === "fulfilled" && result.value) {
          newBalances[symbol] = result.value;
        }
      });

      setBalances(newBalances);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch balances");
    } finally {
      setLoading(false);
    }
  }, [publicKey, connected, connection]);

  // Fetch balances on mount and when wallet changes
  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  // Poll for balance updates every 10 seconds
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [connected, fetchBalances]);

  const getRngBalance = useCallback(() => balances.RNG, [balances.RNG]);

  const getGameTokenBalance = useCallback((tab: string) => {
    const token = TAB_TO_TOKEN[tab];
    if (!token) return null;
    return balances[token];
  }, [balances]);

  return {
    balances,
    loading,
    error,
    refetch: fetchBalances,
    getRngBalance,
    getGameTokenBalance,
  };
}
