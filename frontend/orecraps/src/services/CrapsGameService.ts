import { Connection, PublicKey, Keypair, LAMPORTS_PER_SOL, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { ONE_RNG } from '@/lib/solana';
import { TransactionService } from './LegacyTransactionService';
import {
  createPlaceCrapsBetInstruction,
  createClaimCrapsWinningsInstruction,
  createSettleCrapsInstruction,
  crapsGamePDA,
  crapsPositionPDA,
  parseCrapsGame,
  parseCrapsPosition,
  CrapsGame,
  CrapsPosition,
  CrapsBetType,
} from '@/lib/program';

export interface PlaceBetParams {
  betType: CrapsBetType;
  point?: number;
  amount: number; // in RNG
}

export class CrapsGameService {
  private txService: TransactionService;

  constructor(private connection: Connection) {
    this.txService = new TransactionService(connection);
  }

  async getGameState(): Promise<CrapsGame | null> {
    const [gameAddress] = crapsGamePDA();
    const account = await this.connection.getAccountInfo(gameAddress);
    if (!account) return null;
    return parseCrapsGame(account.data);
  }

  async getPositionState(authority: PublicKey): Promise<CrapsPosition | null> {
    const [positionAddress] = crapsPositionPDA(authority);
    const account = await this.connection.getAccountInfo(positionAddress);
    if (!account) return null;
    return parseCrapsPosition(account.data);
  }

  async placeBets(
    payer: Keypair,
    bets: PlaceBetParams[]
  ): Promise<{ signature: string; success: boolean; error?: string; betsPlaced: number }> {
    const instructions = bets.map(bet => {
      const amountBaseUnits = BigInt(Math.floor(bet.amount * Number(ONE_RNG)));
      return createPlaceCrapsBetInstruction(
        payer.publicKey,
        bet.betType,
        bet.point || 0,
        amountBaseUnits
      );
    });

    const result = await this.txService.sendAndConfirm(instructions, [payer]);

    return {
      ...result,
      betsPlaced: bets.length,
    };
  }

  async validateBalance(publicKey: PublicKey, requiredAmount: number): Promise<{ valid: boolean; balance: number; error?: string }> {
    const balance = await this.connection.getBalance(publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;

    if (balanceSOL < requiredAmount) {
      return {
        valid: false,
        balance: balanceSOL,
        error: `Insufficient balance. Wallet has ${balanceSOL} SOL, but ${requiredAmount} SOL required.`,
      };
    }

    return {
      valid: true,
      balance: balanceSOL,
    };
  }

  /**
   * Place bets on behalf of a user with a separate fee payer
   * Used for delegated transactions where server pays gas
   *
   * @param feePayer - Keypair that will pay transaction fees
   * @param userWallet - User's wallet public key (for account derivation)
   * @param bets - Array of bets to place
   */
  async placeBetsWithFeePayer(
    feePayer: Keypair,
    userWallet: PublicKey,
    bets: PlaceBetParams[]
  ): Promise<{ signature: string; success: boolean; error?: string; betsPlaced: number }> {
    try {
      const instructions = bets.map(bet => {
        const amountBaseUnits = BigInt(Math.floor(bet.amount * Number(ONE_RNG)));
        return createPlaceCrapsBetInstruction(
          userWallet,
          bet.betType,
          bet.point || 0,
          amountBaseUnits
        );
      });

      const tx = new Transaction().add(...instructions);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = feePayer.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [feePayer],
        { commitment: 'confirmed' }
      );

      return {
        signature,
        success: true,
        betsPlaced: bets.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        signature: '',
        success: false,
        error: errorMessage,
        betsPlaced: 0,
      };
    }
  }

  /**
   * Claim winnings on behalf of a user with a separate fee payer
   * Used for delegated transactions where server pays gas
   *
   * @param feePayer - Keypair that will pay transaction fees
   * @param userWallet - User's wallet public key
   */
  async claimWinningsWithFeePayer(
    feePayer: Keypair,
    userWallet: PublicKey
  ): Promise<{ signature: string; success: boolean; error?: string }> {
    try {
      const instruction = createClaimCrapsWinningsInstruction(userWallet);

      const tx = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = feePayer.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [feePayer],
        { commitment: 'confirmed' }
      );

      return {
        signature,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        signature: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Settle bets on behalf of a user with a separate fee payer
   * Used for delegated transactions where server pays gas
   *
   * @param feePayer - Keypair that will pay transaction fees
   * @param userWallet - User's wallet public key
   * @param winningSquare - The winning dice roll
   * @param roundId - The round ID to settle
   */
  async settleBetsWithFeePayer(
    feePayer: Keypair,
    userWallet: PublicKey,
    winningSquare: bigint,
    roundId: bigint
  ): Promise<{ signature: string; success: boolean; error?: string }> {
    try {
      const instruction = createSettleCrapsInstruction(userWallet, winningSquare, roundId);

      const tx = new Transaction().add(instruction);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = feePayer.publicKey;

      const signature = await sendAndConfirmTransaction(
        this.connection,
        tx,
        [feePayer],
        { commitment: 'confirmed' }
      );

      return {
        signature,
        success: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        signature: '',
        success: false,
        error: errorMessage,
      };
    }
  }
}
