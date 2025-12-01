/**
 * Fund Test Keypair with CRAP tokens
 *
 * This script funds the test keypair (used by /api/place-bet) with CRAP tokens
 * so that bets can be placed on localnet.
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const RPC = 'http://127.0.0.1:8899';
const connection = new Connection(RPC, 'confirmed');

// Token mints
const CRAP_MINT = new PublicKey('CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump');

// Load admin keypair (has mint authority)
function loadAdminKeypair() {
  const keypairPath = '/home/r/.config/solana/id.json';
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// Load test keypair (from TEST_KEYPAIR_SEED)
function loadTestKeypair() {
  const seedString = 'XqqclpkdKvsk/ED+Ghq4OUfZ0Bzqm2PDJrQDuTg+N8g='; // From .env.local
  const seed = Buffer.from(seedString, 'base64');
  return Keypair.fromSeed(seed);
}

async function main() {
  console.log('=== Funding Test Keypair with CRAP Tokens ===\n');

  const admin = loadAdminKeypair();
  const testKeypair = loadTestKeypair();

  console.log('Admin pubkey:', admin.publicKey.toString());
  console.log('Test keypair pubkey:', testKeypair.publicKey.toString());

  // Get test keypair's CRAP ATA address
  const testCrapAta = await getAssociatedTokenAddress(
    CRAP_MINT,
    testKeypair.publicKey
  );
  console.log('Test keypair CRAP ATA:', testCrapAta.toString());

  // Check if ATA exists
  const ataInfo = await connection.getAccountInfo(testCrapAta);

  const tx = new Transaction();

  if (!ataInfo) {
    console.log('\nTest keypair CRAP ATA does not exist, creating...');
    tx.add(
      createAssociatedTokenAccountInstruction(
        admin.publicKey, // payer
        testCrapAta,     // ata
        testKeypair.publicKey, // owner
        CRAP_MINT        // mint
      )
    );
  } else {
    console.log('\nTest keypair CRAP ATA already exists');
  }

  // Mint 100,000 CRAP to test keypair
  const amountToMint = BigInt(100_000) * BigInt(1_000_000_000); // 100k with 9 decimals

  console.log('\nMinting 100,000 CRAP to test keypair...');
  tx.add(
    createMintToInstruction(
      CRAP_MINT,
      testCrapAta,
      admin.publicKey, // mint authority
      amountToMint
    )
  );

  // Send transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;

  const signature = await sendAndConfirmTransaction(
    connection,
    tx,
    [admin],
    { commitment: 'confirmed' }
  );

  console.log('Transaction signature:', signature);

  // Verify balance
  const tokenBalance = await connection.getTokenAccountBalance(testCrapAta);
  console.log('\nTest keypair CRAP balance:', tokenBalance.value.uiAmountString);

  // Airdrop SOL to test keypair for gas fees
  console.log('\nAirdropping 10 SOL to test keypair for gas...');
  try {
    const airdropSig = await connection.requestAirdrop(testKeypair.publicKey, 10 * 1_000_000_000);
    await connection.confirmTransaction(airdropSig, 'confirmed');
    console.log('Airdrop confirmed:', airdropSig);
  } catch (err) {
    console.log('Airdrop may have failed (might already have SOL):', err.message);
  }

  // Check SOL balance
  const solBalance = await connection.getBalance(testKeypair.publicKey);
  console.log('Test keypair SOL balance:', solBalance / 1_000_000_000, 'SOL');

  console.log('\n=== Test Keypair Funded! ===');
  console.log('You can now use /api/place-bet to place bets.');
}

main().catch(console.error);
