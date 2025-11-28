import {
  Connection,
  Transaction,
  TransactionInstruction,
  Keypair,
  PublicKey,
  Commitment,
  Signer,
  SendOptions,
} from "@solana/web3.js";
import { WalletContextState } from "@solana/wallet-adapter-react";
import { getConnection, withFallback } from "@/lib/network";
import { createDebugger } from "@/lib/debug";
import {
  createPlaceCrapsBetInstruction,
  createSettleCrapsInstruction,
  createClaimCrapsWinningsInstruction,
  createFundCrapsHouseInstruction,
  createDeployInstruction,
  createCheckpointInstruction,
  createClaimSOLInstruction,
  CrapsBetType,
} from "@/lib/program";

const debug = createDebugger("TransactionService");

/**
 * Result of a transaction operation
 */
export interface TransactionResult {
  /** Whether the transaction succeeded */
  success: boolean;
  /** Transaction signature (if successful) */
  signature?: string;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Options for sending transactions
 */
export interface SendTransactionOptions {
  /** Commitment level for confirmation (default: 'confirmed') */
  commitment?: Commitment;
  /** Skip preflight checks (default: false) */
  skipPreflight?: boolean;
  /** Maximum number of retries for transaction confirmation (default: 3) */
  maxRetries?: number;
}

/**
 * Options for simulating transactions
 */
export interface SimulateTransactionOptions {
  /** Whether this is a simulation mode transaction */
  simulate?: boolean;
  /** Custom signature prefix for simulation (default: 'sim') */
  signaturePrefix?: string;
}

/**
 * Parameters for placing a craps bet
 */
export interface PlaceBetParams {
  /** Type of bet */
  betType: CrapsBetType;
  /** Point number (for Come/Place/Hardway bets) */
  point?: number;
  /** Amount in SOL */
  amount: number;
}

/**
 * Parameters for deploying to squares
 */
export interface DeployParams {
  /** Amount in lamports per square */
  amount: bigint;
  /** Current round ID */
  roundId: bigint;
  /** Selected squares (boolean array) */
  squares: boolean[];
}

/**
 * Parameters for settling craps bets
 */
export interface SettleCrapsParams {
  /** Winning square from the round */
  winningSquare: bigint;
  /** Round ID for verification */
  roundId: bigint;
}

/**
 * Transaction Service
 *
 * Centralizes all transaction building, signing, and sending logic.
 * Provides typed methods for common operations with consistent error handling.
 * Supports both wallet-signed (client) and keypair-signed (server) transactions.
 *
 * @example
 * ```typescript
 * // Client-side with wallet
 * const service = new TransactionService();
 * const result = await service.placeCrapsBets(wallet, connection, [
 *   { betType: CrapsBetType.PassLine, amount: 0.1 }
 * ]);
 *
 * // Server-side with keypair
 * const service = new TransactionService();
 * const result = await service.sendWithKeypair(
 *   [instruction],
 *   payer,
 *   connection
 * );
 *
 * // Simulation mode
 * const result = await service.simulateTransaction();
 * ```
 */
export class TransactionService {
  private defaultOptions: SendTransactionOptions = {
    commitment: "confirmed",
    skipPreflight: false,
    maxRetries: 3,
  };

  /**
   * Create a new TransactionService instance
   *
   * @param connection - Optional Solana connection (uses network abstraction if not provided)
   */
  constructor(private connection?: Connection) {}

  /**
   * Get the connection to use for transactions
   * Uses injected connection or falls back to network abstraction
   */
  private getConnectionInstance(): Connection {
    return this.connection || getConnection();
  }

  /**
   * Build a transaction with proper blockhash and fee payer
   *
   * @param instructions - Instructions to include in transaction
   * @param feePayer - Public key of the fee payer
   * @param connection - Connection to use for fetching blockhash
   * @returns Transaction with blockhash and fee payer set
   */
  private async buildTransaction(
    instructions: TransactionInstruction[],
    feePayer: PublicKey,
    connection: Connection
  ): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
  }> {
    const transaction = new Transaction().add(...instructions);

    // Get latest blockhash using network abstraction for automatic failover
    const { blockhash, lastValidBlockHeight } = await withFallback(
      async (conn) => conn.getLatestBlockhash()
    );

    transaction.recentBlockhash = blockhash;
    transaction.feePayer = feePayer;

    return { transaction, blockhash, lastValidBlockHeight };
  }

  /**
   * Validate a transaction signature
   *
   * @param signature - Signature to validate
   * @throws Error if signature is invalid
   */
  private validateSignature(signature: string): void {
    if (!signature || typeof signature !== "string" || signature.length === 0) {
      throw new Error("Invalid transaction signature received");
    }
  }

  /**
   * Transform error to user-friendly message
   *
   * @param error - Error to transform
   * @returns User-friendly error message
   */
  private transformError(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message;

      // User cancelled transaction
      if (message.includes("User rejected") || message.includes("User declined")) {
        return "Transaction cancelled by user";
      }

      // Insufficient funds
      if (message.includes("insufficient funds") || message.includes("0x1")) {
        return "Insufficient SOL balance for transaction";
      }

      // Rate limit
      if (message.includes("429") || message.includes("rate limit")) {
        return "RPC rate limit exceeded. Please try again in a moment.";
      }

      // Network error
      if (message.includes("fetch") || message.includes("network")) {
        return "Network error. Please check your connection.";
      }

      // Blockhash not found (transaction expired)
      if (message.includes("block height exceeded") || message.includes("Blockhash not found")) {
        return "Transaction expired. Please try again.";
      }

      return message;
    }

    return "Unknown transaction error";
  }

  /**
   * Send a transaction using a wallet adapter
   *
   * @param instructions - Instructions to execute
   * @param wallet - Wallet context from useWallet()
   * @param connection - Optional connection (uses network abstraction if not provided)
   * @param options - Transaction options
   * @returns Transaction result with signature or error
   */
  async sendWithWallet(
    instructions: TransactionInstruction[],
    wallet: WalletContextState,
    connection?: Connection,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const conn = connection || this.getConnectionInstance();

    try {
      if (!wallet.publicKey || !wallet.connected) {
        throw new Error("Wallet not connected");
      }

      if (!wallet.sendTransaction) {
        throw new Error("Wallet does not support sendTransaction");
      }

      debug("Building transaction for wallet", wallet.publicKey.toBase58());

      // Build transaction
      const { transaction, blockhash, lastValidBlockHeight } =
        await this.buildTransaction(instructions, wallet.publicKey, conn);

      debug("Requesting wallet signature...");

      // Send transaction through wallet
      const sendOptions: SendOptions = {
        skipPreflight: opts.skipPreflight,
      };

      const signature = await wallet.sendTransaction(transaction, conn, sendOptions);

      // Validate signature
      this.validateSignature(signature);

      debug("Transaction sent:", signature);
      debug("Confirming transaction...");

      // Confirm transaction with retries
      await withFallback(
        async (fallbackConn) => {
          await fallbackConn.confirmTransaction(
            {
              signature,
              blockhash,
              lastValidBlockHeight,
            },
            opts.commitment
          );
        },
        opts.maxRetries
      );

      debug("Transaction confirmed:", signature);

      return {
        success: true,
        signature,
      };
    } catch (error) {
      debug("Transaction error:", error);
      const errorMessage = this.transformError(error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a transaction using a keypair (server-side)
   *
   * @param instructions - Instructions to execute
   * @param signer - Keypair to sign the transaction
   * @param connection - Optional connection (uses network abstraction if not provided)
   * @param additionalSigners - Additional signers if needed
   * @param options - Transaction options
   * @returns Transaction result with signature or error
   */
  async sendWithKeypair(
    instructions: TransactionInstruction[],
    signer: Keypair,
    connection?: Connection,
    additionalSigners: Signer[] = [],
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    const opts = { ...this.defaultOptions, ...options };
    const conn = connection || this.getConnectionInstance();

    try {
      debug("Building transaction for keypair", signer.publicKey.toBase58());

      // Build transaction
      const { transaction, blockhash, lastValidBlockHeight } =
        await this.buildTransaction(instructions, signer.publicKey, conn);

      // Sign transaction
      const allSigners = [signer, ...additionalSigners];
      transaction.sign(...allSigners);

      debug("Sending raw transaction...");

      // Send raw transaction with automatic failover
      const signature = await withFallback(
        async (fallbackConn) => {
          return fallbackConn.sendRawTransaction(transaction.serialize(), {
            skipPreflight: opts.skipPreflight,
          });
        },
        opts.maxRetries
      );

      debug("Transaction sent:", signature);
      debug("Confirming transaction...");

      // Confirm transaction
      await withFallback(
        async (fallbackConn) => {
          await fallbackConn.confirmTransaction(
            {
              signature,
              blockhash,
              lastValidBlockHeight,
            },
            opts.commitment
          );
        },
        opts.maxRetries
      );

      debug("Transaction confirmed:", signature);

      return {
        success: true,
        signature,
      };
    } catch (error) {
      debug("Transaction error:", error);
      const errorMessage = this.transformError(error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Simulate a transaction without sending it to the network
   *
   * Useful for testing and UI demonstrations without consuming SOL.
   *
   * @param options - Simulation options
   * @returns Simulated transaction result
   */
  async simulateTransaction(
    options: SimulateTransactionOptions = {}
  ): Promise<TransactionResult> {
    const prefix = options.signaturePrefix || "sim";
    const signature = `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;

    debug("Simulated transaction:", signature);

    return {
      success: true,
      signature,
    };
  }

  // ============================================================================
  // TYPED TRANSACTION BUILDERS - CRAPS OPERATIONS
  // ============================================================================

  /**
   * Place one or more craps bets
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param bets - Array of bets to place
   * @param options - Transaction options
   * @returns Transaction result
   *
   * @example
   * ```typescript
   * const result = await service.placeCrapsBets(wallet, connection, [
   *   { betType: CrapsBetType.PassLine, amount: 0.1 },
   *   { betType: CrapsBetType.Field, amount: 0.05 }
   * ]);
   * ```
   */
  async placeCrapsBets(
    wallet: WalletContextState,
    connection: Connection,
    bets: PlaceBetParams[],
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult & { betsPlaced?: number }> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    if (bets.length === 0) {
      return {
        success: false,
        error: "No bets provided",
      };
    }

    try {
      // Build instructions for all bets
      const instructions = bets.map((bet) => {
        const amountLamports = BigInt(
          Math.floor(bet.amount * 1_000_000_000) // LAMPORTS_PER_SOL
        );
        return createPlaceCrapsBetInstruction(
          wallet.publicKey!,
          bet.betType,
          bet.point || 0,
          amountLamports
        );
      });

      const result = await this.sendWithWallet(instructions, wallet, connection, options);

      return {
        ...result,
        betsPlaced: result.success ? bets.length : 0,
      };
    } catch (error) {
      return {
        success: false,
        error: this.transformError(error),
      };
    }
  }

  /**
   * Settle craps bets for a round
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param params - Settlement parameters
   * @param options - Transaction options
   * @returns Transaction result
   */
  async settleCraps(
    wallet: WalletContextState,
    connection: Connection,
    params: SettleCrapsParams,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    const instruction = createSettleCrapsInstruction(
      wallet.publicKey,
      params.winningSquare,
      params.roundId
    );

    return this.sendWithWallet([instruction], wallet, connection, options);
  }

  /**
   * Claim craps winnings
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param options - Transaction options
   * @returns Transaction result
   */
  async claimCrapsWinnings(
    wallet: WalletContextState,
    connection: Connection,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    const instruction = createClaimCrapsWinningsInstruction(wallet.publicKey);

    return this.sendWithWallet([instruction], wallet, connection, options);
  }

  /**
   * Fund the craps house bankroll
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param amountLamports - Amount to fund in lamports
   * @param options - Transaction options
   * @returns Transaction result
   */
  async fundCrapsHouse(
    wallet: WalletContextState,
    connection: Connection,
    amountLamports: bigint,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    const instruction = createFundCrapsHouseInstruction(
      wallet.publicKey,
      amountLamports
    );

    return this.sendWithWallet([instruction], wallet, connection, options);
  }

  // ============================================================================
  // TYPED TRANSACTION BUILDERS - MINING OPERATIONS
  // ============================================================================

  /**
   * Deploy SOL to mining squares
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param params - Deploy parameters
   * @param options - Transaction options
   * @returns Transaction result
   */
  async deploy(
    wallet: WalletContextState,
    connection: Connection,
    params: DeployParams,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    const instruction = createDeployInstruction(
      wallet.publicKey,
      wallet.publicKey, // authority is same as signer
      params.amount,
      params.roundId,
      params.squares
    );

    return this.sendWithWallet([instruction], wallet, connection, options);
  }

  /**
   * Checkpoint mining progress
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param roundId - Round ID to checkpoint
   * @param options - Transaction options
   * @returns Transaction result
   */
  async checkpoint(
    wallet: WalletContextState,
    connection: Connection,
    roundId: bigint,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    const instruction = createCheckpointInstruction(
      wallet.publicKey,
      wallet.publicKey, // authority is same as signer
      roundId
    );

    return this.sendWithWallet([instruction], wallet, connection, options);
  }

  /**
   * Claim mining SOL rewards
   *
   * @param wallet - Wallet to sign the transaction
   * @param connection - Connection to use
   * @param options - Transaction options
   * @returns Transaction result
   */
  async claimSOL(
    wallet: WalletContextState,
    connection: Connection,
    options: SendTransactionOptions = {}
  ): Promise<TransactionResult> {
    if (!wallet.publicKey) {
      return {
        success: false,
        error: "Wallet not connected",
      };
    }

    const instruction = createClaimSOLInstruction(wallet.publicKey);

    return this.sendWithWallet([instruction], wallet, connection, options);
  }
}

/**
 * Create a new transaction service instance
 *
 * @param connection - Optional connection to use
 * @returns New TransactionService instance
 *
 * @example
 * ```typescript
 * const service = createTransactionService();
 * const result = await service.placeCrapsBets(wallet, connection, bets);
 * ```
 */
export function createTransactionService(connection?: Connection): TransactionService {
  return new TransactionService(connection);
}
