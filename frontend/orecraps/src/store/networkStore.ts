"use client";

/**
 * Network Store - Migrated for Anza Kit compatibility
 *
 * This store manages network selection (localnet/devnet) and RPC configuration.
 * Uses legacy PublicKey for compatibility with stores that need to return PublicKey.
 * Kit types are available via re-exports from lib/solana.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PublicKey } from "@solana/web3.js";
import { setNetworkMode } from "@/lib/network";
import { createDebugger } from "@/lib/debug";

const debug = createDebugger("NetworkStore");

export type NetworkType = "localnet" | "devnet";

// Program IDs per network
export const PROGRAM_IDS: Record<NetworkType, string> = {
  localnet: "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK", // Will be replaced after localnet deploy
  devnet: "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK",
};

// RPC endpoints per network
export const RPC_ENDPOINTS: Record<NetworkType, string[]> = {
  localnet: [
    "http://127.0.0.1:8899",
    "http://localhost:8899",
  ],
  devnet: [
    process.env.NEXT_PUBLIC_RPC_ENDPOINT || "",
    "https://api.devnet.solana.com",
    "https://devnet.genesysgo.net",
  ].filter(Boolean),
};

// Token mints per network (will be created on localnet)
export const TOKEN_MINTS: Record<NetworkType, { rng: string; crap: string }> = {
  localnet: {
    rng: "RaBMafFSe53m9VU7CFf7ZWv7cQwUYFwBt926YZKLAVC", // Created on localnet deploy
    crap: "5buiHDD8uGJFMfRU1wCF8Fcjxqr45SSrz9ErX65mJ6qS", // Placeholder - created on deploy
  },
  devnet: {
    rng: "AG7WRHgsvg97pUT8wa59eFVmAf3UGLbxUpPRV4dGDaPc",
    crap: "5buiHDD8uGJFMfRU1wCF8Fcjxqr45SSrz9ErX65mJ6qS",
  },
};

interface NetworkState {
  network: NetworkType;
  isLocalnetRunning: boolean;
  localnetProgramId: string | null;
  setNetwork: (network: NetworkType) => void;
  setLocalnetRunning: (running: boolean) => void;
  setLocalnetProgramId: (programId: string) => void;
  getCurrentRpcEndpoint: () => string;
  getCurrentProgramId: () => PublicKey;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      network: "devnet",
      isLocalnetRunning: false,
      localnetProgramId: null,

      setNetwork: (network) => {
        setNetworkMode(network);
        set({ network });
      },
      setLocalnetRunning: (running) => set({ isLocalnetRunning: running }),
      setLocalnetProgramId: (programId) => set({ localnetProgramId: programId }),

      getCurrentRpcEndpoint: () => {
        const { network } = get();
        return RPC_ENDPOINTS[network][0];
      },

      getCurrentProgramId: () => {
        const { network, localnetProgramId } = get();
        if (network === "localnet" && localnetProgramId) {
          return new PublicKey(localnetProgramId);
        }
        return new PublicKey(PROGRAM_IDS[network]);
      },
    }),
    {
      name: "orecraps-network",
      partialize: (state) => ({
        network: state.network,
        localnetProgramId: state.localnetProgramId,
      }),
      // Sync rpcManager when store rehydrates from localStorage
      onRehydrateStorage: () => (state) => {
        if (state) {
          debug(`Rehydrated with network: ${state.network}`);
          setNetworkMode(state.network);
        }
      },
    }
  )
);
