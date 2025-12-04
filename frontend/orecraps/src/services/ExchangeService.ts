/**
 * Exchange Service - On-chain AMM for RNG/SOL and RNG/Game Token swaps
 *
 * Features:
 * - Constant product AMM (x*y=k) for RNG/SOL pool
 * - Fixed ratio swaps for RNG ↔ game tokens
 * - 1% fee on all swaps
 * - Fee distribution: 50% to LP providers, 50% to protocol
 *
 * ALL SWAPS ARE EXECUTED ON-CHAIN - NO SIMULATIONS
 */

import { PublicKey, Connection, Transaction, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  RNG_MINT,
  CRAP_MINT,
  CARAT_MINT,
  BJ_MINT,
  ROUL_MINT,
  WAR_MINT,
  SICO_MINT,
  TCP_MINT,
  VPK_MINT,
  UTH_MINT,
  ONE_RNG,
  ORE_PROGRAM_ID,
} from "@/lib/solana";

// PDA seeds
const EXCHANGE_POOL_SEED = "exchange_pool";
const EXCHANGE_SOL_VAULT_SEED = "exchange_sol_vault";
const EXCHANGE_RNG_VAULT_SEED = "exchange_rng_vault";

// Wrapped SOL mint
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");

// Fee configuration (for display only - actual fees computed on-chain)
export const SWAP_FEE_BPS = 100; // 1% = 100 basis points
export const FEE_DISTRIBUTION_BPS = 5000; // 50% to LP, 50% to protocol

// Instruction discriminators
const SWAP_SOL_TO_RNG = 79;
const SWAP_RNG_TO_SOL = 80;
const SWAP_RNG_TO_GAME_TOKEN = 81;
const SWAP_GAME_TOKEN_TO_RNG = 82;

// Game token configuration
export const GAME_TOKENS = {
  CRAP: { mint: CRAP_MINT, name: "CRAP", game: "Craps", gameType: 0 },
  CARAT: { mint: CARAT_MINT, name: "CARAT", game: "Baccarat", gameType: 1 },
  BJ: { mint: BJ_MINT, name: "BJ", game: "Blackjack", gameType: 2 },
  ROUL: { mint: ROUL_MINT, name: "ROUL", game: "Roulette", gameType: 3 },
  WAR: { mint: WAR_MINT, name: "WAR", game: "Casino War", gameType: 4 },
  SICO: { mint: SICO_MINT, name: "SICO", game: "Sic Bo", gameType: 5 },
  TCP: { mint: TCP_MINT, name: "TCP", game: "Three Card Poker", gameType: 6 },
  VPK: { mint: VPK_MINT, name: "VPK", game: "Video Poker", gameType: 7 },
  UTH: { mint: UTH_MINT, name: "UTH", game: "Ultimate Texas Hold'em", gameType: 8 },
} as const;

export type GameTokenKey = keyof typeof GAME_TOKENS;

// Pool state interface (read from chain)
export interface LiquidityPool {
  solReserve: bigint;
  rngReserve: bigint;
  lpTokenSupply: bigint;
  totalFeesCollected: bigint;
  feesToStakers: bigint;
  feesToBuyback: bigint;
}

// Swap quote interface
export interface SwapQuote {
  inputAmount: bigint;
  outputAmount: bigint;
  fee: bigint;
  feeToStakers: bigint;
  feeToBuyback: bigint;
  priceImpact: number;
  rate: number;
}

// Helper: Convert number to little-endian bytes
function toLeBytes(n: bigint, len: number): Uint8Array {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

export class ExchangeService {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  // ============================================================================
  // PDA DERIVATION
  // ============================================================================

  getPoolAddress(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(EXCHANGE_POOL_SEED)],
      ORE_PROGRAM_ID
    );
    return pda;
  }

  getSolVaultAddress(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(EXCHANGE_SOL_VAULT_SEED)],
      ORE_PROGRAM_ID
    );
    return pda;
  }

  getRngVaultAddress(): PublicKey {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from(EXCHANGE_RNG_VAULT_SEED)],
      ORE_PROGRAM_ID
    );
    return pda;
  }

  // ============================================================================
  // FETCH POOL STATE FROM CHAIN
  // ============================================================================

  async fetchPoolFromChain(): Promise<LiquidityPool | null> {
    try {
      const poolAddress = this.getPoolAddress();
      const accountInfo = await this.connection.getAccountInfo(poolAddress);

      if (!accountInfo || !accountInfo.data) {
        console.log("Exchange pool not found on chain");
        return null;
      }

      const data = accountInfo.data;

      // Parse pool state from account data
      // Layout: 8 byte discriminator + 4x32 byte pubkeys (128) + fields
      // Offset 136: sol_reserve (u64)
      // Offset 144: rng_reserve (u64)
      // Offset 168: total_lp_supply (u64)
      // Offset 216: total_fees_collected_sol (u64)

      const solReserve = data.readBigUInt64LE(136);
      const rngReserve = data.readBigUInt64LE(144);
      const lpTokenSupply = data.readBigUInt64LE(168);
      const totalFeesCollectedSol = data.readBigUInt64LE(216);

      const pool: LiquidityPool = {
        solReserve,
        rngReserve,
        lpTokenSupply,
        totalFeesCollected: totalFeesCollectedSol,
        feesToStakers: 0n,
        feesToBuyback: 0n,
      };

      console.log("Pool fetched from chain:", {
        solReserve: Number(solReserve) / 1e9,
        rngReserve: Number(rngReserve) / Number(ONE_RNG),
        lpSupply: Number(lpTokenSupply),
      });

      return pool;
    } catch (error) {
      console.error("Error fetching pool from chain:", error);
      return null;
    }
  }

  getPoolState(): LiquidityPool {
    // Return empty state - caller should use fetchPoolFromChain
    return {
      solReserve: 0n,
      rngReserve: 0n,
      lpTokenSupply: 0n,
      totalFeesCollected: 0n,
      feesToStakers: 0n,
      feesToBuyback: 0n,
    };
  }

  getStakerRewards(): bigint {
    return 0n;
  }

  // ============================================================================
  // QUOTE CALCULATIONS (for UI display)
  // ============================================================================

  quoteSolToRng(solAmountLamports: bigint, pool: LiquidityPool): SwapQuote {
    if (pool.solReserve === 0n || pool.rngReserve === 0n) {
      return {
        inputAmount: solAmountLamports,
        outputAmount: 0n,
        fee: 0n,
        feeToStakers: 0n,
        feeToBuyback: 0n,
        priceImpact: 0,
        rate: 0,
      };
    }

    // Calculate fee (1%)
    const fee = (solAmountLamports * BigInt(SWAP_FEE_BPS)) / 10000n;
    const inputAfterFee = solAmountLamports - fee;

    // Constant product formula: x * y = k
    const k = pool.solReserve * pool.rngReserve;
    const newSolReserve = pool.solReserve + inputAfterFee;
    const newRngReserve = k / newSolReserve;
    const outputAmount = pool.rngReserve - newRngReserve;

    // Calculate price impact
    const spotPrice = Number(pool.rngReserve) / Number(pool.solReserve);
    const executionPrice = Number(outputAmount) / Number(inputAfterFee);
    const priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice) * 100;

    // Fee distribution (for display)
    const feeToStakers = (fee * BigInt(FEE_DISTRIBUTION_BPS)) / 10000n;
    const feeToBuyback = fee - feeToStakers;

    return {
      inputAmount: solAmountLamports,
      outputAmount,
      fee,
      feeToStakers,
      feeToBuyback,
      priceImpact,
      rate: Number(outputAmount) / Number(solAmountLamports),
    };
  }

  quoteRngToSol(rngAmount: bigint, pool: LiquidityPool): SwapQuote {
    if (pool.solReserve === 0n || pool.rngReserve === 0n) {
      return {
        inputAmount: rngAmount,
        outputAmount: 0n,
        fee: 0n,
        feeToStakers: 0n,
        feeToBuyback: 0n,
        priceImpact: 0,
        rate: 0,
      };
    }

    // Calculate fee (1%)
    const fee = (rngAmount * BigInt(SWAP_FEE_BPS)) / 10000n;
    const inputAfterFee = rngAmount - fee;

    // Constant product formula
    const k = pool.solReserve * pool.rngReserve;
    const newRngReserve = pool.rngReserve + inputAfterFee;
    const newSolReserve = k / newRngReserve;
    const outputAmount = pool.solReserve - newSolReserve;

    // Calculate price impact
    const spotPrice = Number(pool.solReserve) / Number(pool.rngReserve);
    const executionPrice = Number(outputAmount) / Number(inputAfterFee);
    const priceImpact = Math.abs((spotPrice - executionPrice) / spotPrice) * 100;

    // Fee distribution
    const feeToStakers = (fee * BigInt(FEE_DISTRIBUTION_BPS)) / 10000n;
    const feeToBuyback = fee - feeToStakers;

    return {
      inputAmount: rngAmount,
      outputAmount,
      fee,
      feeToStakers,
      feeToBuyback,
      priceImpact,
      rate: Number(outputAmount) / Number(rngAmount),
    };
  }

  quoteRngToGameToken(rngAmount: bigint): SwapQuote {
    // 1% fee, 1:1 ratio after fee
    const fee = (rngAmount * BigInt(SWAP_FEE_BPS)) / 10000n;
    const outputAmount = rngAmount - fee;
    const feeToStakers = (fee * BigInt(FEE_DISTRIBUTION_BPS)) / 10000n;
    const feeToBuyback = fee - feeToStakers;

    return {
      inputAmount: rngAmount,
      outputAmount,
      fee,
      feeToStakers,
      feeToBuyback,
      priceImpact: 0,
      rate: Number(outputAmount) / Number(rngAmount),
    };
  }

  quoteGameTokenToRng(tokenAmount: bigint): SwapQuote {
    // 1% fee, 1:1 ratio after fee
    const fee = (tokenAmount * BigInt(SWAP_FEE_BPS)) / 10000n;
    const outputAmount = tokenAmount - fee;
    const feeToStakers = (fee * BigInt(FEE_DISTRIBUTION_BPS)) / 10000n;
    const feeToBuyback = fee - feeToStakers;

    return {
      inputAmount: tokenAmount,
      outputAmount,
      fee,
      feeToStakers,
      feeToBuyback,
      priceImpact: 0,
      rate: Number(outputAmount) / Number(tokenAmount),
    };
  }

  // ============================================================================
  // INSTRUCTION BUILDERS
  // ============================================================================

  /**
   * Build SwapSolToRng instruction
   *
   * Account layout:
   * 0: user (signer)
   * 1: exchange_pool (PDA, writable)
   * 2: sol_vault (PDA, writable)
   * 3: rng_vault (PDA, writable)
   * 4: user_rng_ata (writable)
   * 5: rng_mint
   * 6: sol_mint
   * 7: system_program
   * 8: token_program
   */
  async buildSwapSolToRngInstruction(
    user: PublicKey,
    solAmount: bigint,
    minRngOut: bigint
  ): Promise<TransactionInstruction> {
    const exchangePool = this.getPoolAddress();
    const solVault = this.getSolVaultAddress();
    const rngVault = this.getRngVaultAddress();
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, user);

    // Instruction data: discriminator(1) + sol_amount(8) + min_rng_out(8)
    const data = new Uint8Array(17);
    data[0] = SWAP_SOL_TO_RNG;
    data.set(toLeBytes(solAmount, 8), 1);
    data.set(toLeBytes(minRngOut, 8), 9);

    return new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: exchangePool, isSigner: false, isWritable: true },
        { pubkey: solVault, isSigner: false, isWritable: true },
        { pubkey: rngVault, isSigner: false, isWritable: true },
        { pubkey: userRngAta, isSigner: false, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: false },
        { pubkey: SOL_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
  }

  /**
   * Build SwapRngToSol instruction
   *
   * Account layout:
   * 0: user (signer)
   * 1: exchange_pool (PDA, writable)
   * 2: sol_vault (PDA, writable)
   * 3: rng_vault (PDA, writable)
   * 4: user_rng_ata (writable)
   * 5: rng_mint
   * 6: sol_mint
   * 7: system_program
   * 8: token_program
   */
  async buildSwapRngToSolInstruction(
    user: PublicKey,
    rngAmount: bigint,
    minSolOut: bigint
  ): Promise<TransactionInstruction> {
    const exchangePool = this.getPoolAddress();
    const solVault = this.getSolVaultAddress();
    const rngVault = this.getRngVaultAddress();
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, user);

    // Instruction data: discriminator(1) + rng_amount(8) + min_sol_out(8)
    const data = new Uint8Array(17);
    data[0] = SWAP_RNG_TO_SOL;
    data.set(toLeBytes(rngAmount, 8), 1);
    data.set(toLeBytes(minSolOut, 8), 9);

    return new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: exchangePool, isSigner: false, isWritable: true },
        { pubkey: solVault, isSigner: false, isWritable: true },
        { pubkey: rngVault, isSigner: false, isWritable: true },
        { pubkey: userRngAta, isSigner: false, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: false },
        { pubkey: SOL_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
  }

  /**
   * Build SwapRngToGameToken instruction
   */
  async buildSwapRngToGameTokenInstruction(
    user: PublicKey,
    rngAmount: bigint,
    gameToken: GameTokenKey
  ): Promise<TransactionInstruction> {
    const gameInfo = GAME_TOKENS[gameToken];
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, user);
    const userGameAta = await getAssociatedTokenAddress(gameInfo.mint, user);
    const exchangePool = this.getPoolAddress();
    const rngVault = this.getRngVaultAddress();

    // Instruction data: discriminator(1) + rng_amount(8) + game_type(1)
    const data = new Uint8Array(10);
    data[0] = SWAP_RNG_TO_GAME_TOKEN;
    data.set(toLeBytes(rngAmount, 8), 1);
    data[9] = gameInfo.gameType;

    return new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: exchangePool, isSigner: false, isWritable: true },
        { pubkey: rngVault, isSigner: false, isWritable: true },
        { pubkey: userRngAta, isSigner: false, isWritable: true },
        { pubkey: userGameAta, isSigner: false, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: false },
        { pubkey: gameInfo.mint, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
  }

  /**
   * Build SwapGameTokenToRng instruction
   */
  async buildSwapGameTokenToRngInstruction(
    user: PublicKey,
    tokenAmount: bigint,
    gameToken: GameTokenKey
  ): Promise<TransactionInstruction> {
    const gameInfo = GAME_TOKENS[gameToken];
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, user);
    const userGameAta = await getAssociatedTokenAddress(gameInfo.mint, user);
    const exchangePool = this.getPoolAddress();
    const rngVault = this.getRngVaultAddress();

    // Instruction data: discriminator(1) + token_amount(8) + game_type(1)
    const data = new Uint8Array(10);
    data[0] = SWAP_GAME_TOKEN_TO_RNG;
    data.set(toLeBytes(tokenAmount, 8), 1);
    data[9] = gameInfo.gameType;

    return new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: user, isSigner: true, isWritable: true },
        { pubkey: exchangePool, isSigner: false, isWritable: true },
        { pubkey: rngVault, isSigner: false, isWritable: true },
        { pubkey: userRngAta, isSigner: false, isWritable: true },
        { pubkey: userGameAta, isSigner: false, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: true },
        { pubkey: gameInfo.mint, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from(data),
    });
  }

  // ============================================================================
  // TRANSACTION BUILDERS (return Transaction for wallet to sign)
  // ============================================================================

  async buildSwapSolToRngTransaction(
    user: PublicKey,
    solAmount: bigint,
    minRngOut: bigint
  ): Promise<Transaction> {
    const tx = new Transaction();

    // Ensure user has RNG ATA
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, user);
    const ataInfo = await this.connection.getAccountInfo(userRngAta);
    if (!ataInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(user, userRngAta, user, RNG_MINT)
      );
    }

    // Add swap instruction
    const swapIx = await this.buildSwapSolToRngInstruction(user, solAmount, minRngOut);
    tx.add(swapIx);

    return tx;
  }

  async buildSwapRngToSolTransaction(
    user: PublicKey,
    rngAmount: bigint,
    minSolOut: bigint
  ): Promise<Transaction> {
    const tx = new Transaction();
    const swapIx = await this.buildSwapRngToSolInstruction(user, rngAmount, minSolOut);
    tx.add(swapIx);
    return tx;
  }

  async buildSwapRngToGameTokenTransaction(
    user: PublicKey,
    rngAmount: bigint,
    gameToken: GameTokenKey
  ): Promise<Transaction> {
    const tx = new Transaction();
    const gameInfo = GAME_TOKENS[gameToken];

    // Ensure user has game token ATA
    const userGameAta = await getAssociatedTokenAddress(gameInfo.mint, user);
    const ataInfo = await this.connection.getAccountInfo(userGameAta);
    if (!ataInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(user, userGameAta, user, gameInfo.mint)
      );
    }

    const swapIx = await this.buildSwapRngToGameTokenInstruction(user, rngAmount, gameToken);
    tx.add(swapIx);
    return tx;
  }

  async buildSwapGameTokenToRngTransaction(
    user: PublicKey,
    tokenAmount: bigint,
    gameToken: GameTokenKey
  ): Promise<Transaction> {
    const tx = new Transaction();

    // Ensure user has RNG ATA
    const userRngAta = await getAssociatedTokenAddress(RNG_MINT, user);
    const ataInfo = await this.connection.getAccountInfo(userRngAta);
    if (!ataInfo) {
      tx.add(
        createAssociatedTokenAccountInstruction(user, userRngAta, user, RNG_MINT)
      );
    }

    const swapIx = await this.buildSwapGameTokenToRngInstruction(user, tokenAmount, gameToken);
    tx.add(swapIx);
    return tx;
  }

  // ============================================================================
  // POOL UTILITIES
  // ============================================================================

  getPoolPrice(pool: LiquidityPool): number {
    if (pool.solReserve === 0n) return 0;
    return Number(pool.rngReserve) / Number(pool.solReserve);
  }

  getPoolTvl(pool: LiquidityPool): number {
    const solValue = Number(pool.solReserve) / 1e9;
    const price = this.getPoolPrice(pool);
    const rngValue = price > 0 ? Number(pool.rngReserve) / Number(ONE_RNG) / price : 0;
    return solValue + rngValue;
  }
}

// Singleton instance
let exchangeInstance: ExchangeService | null = null;

export function getExchangeService(connection: Connection): ExchangeService {
  if (!exchangeInstance) {
    exchangeInstance = new ExchangeService(connection);
  }
  return exchangeInstance;
}
