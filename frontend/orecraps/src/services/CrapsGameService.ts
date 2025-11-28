import { Connection, PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TransactionService } from './TransactionService';
import {
  createPlaceCrapsBetInstruction,
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
  amount: number; // in SOL
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
      const amountLamports = BigInt(Math.floor(bet.amount * LAMPORTS_PER_SOL));
      return createPlaceCrapsBetInstruction(
        payer.publicKey,
        bet.betType,
        bet.point || 0,
        amountLamports
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
}
