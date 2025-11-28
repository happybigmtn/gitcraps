import { Connection, Transaction, Keypair, TransactionInstruction, Commitment } from '@solana/web3.js';

export class TransactionService {
  constructor(private connection: Connection) {}

  async sendAndConfirm(
    instructions: TransactionInstruction[],
    signers: Keypair[],
    commitment: Commitment = 'confirmed'
  ): Promise<{ signature: string; success: boolean; error?: string }> {
    try {
      const transaction = new Transaction().add(...instructions);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = signers[0].publicKey;

      transaction.sign(...signers);

      const signature = await this.connection.sendRawTransaction(transaction.serialize());

      const result = await this.connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, commitment);

      if (result.value.err) {
        return { signature, success: false, error: JSON.stringify(result.value.err) };
      }

      return { signature, success: true };
    } catch (error) {
      return { signature: '', success: false, error: String(error) };
    }
  }
}
