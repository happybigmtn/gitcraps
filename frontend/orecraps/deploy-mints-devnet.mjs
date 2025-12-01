/**
 * Deploy CRAP_MINT and RNG_MINT token accounts to devnet
 *
 * This script creates SPL Token mints at the vanity addresses used by the ORE program.
 * Since we don't have the vanity keypairs, we use solana's write-account approach
 * by decoding the existing localnet account data and writing it directly.
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { createInitializeMintInstruction, TOKEN_PROGRAM_ID, MINT_SIZE, getMinimumBalanceForRentExemptMint } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

const DEVNET_RPC = 'https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7';
const CRAP_MINT = 'CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump';
const RNG_MINT = 'RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump';

async function main() {
  console.log('=== Devnet Mint Deployment ===\n');

  // Load the payer keypair
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || '/home/r/.config/solana/id.json';
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
  const payer = Keypair.fromSecretKey(new Uint8Array(keypairData));

  console.log('Payer:', payer.publicKey.toBase58());

  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // Check payer balance
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  if (balance < 0.1e9) {
    console.log('\nInsufficient balance. Request airdrop...');
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 2e9);
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('Airdrop successful');
    } catch (e) {
      console.log('Airdrop failed (likely rate limited). Please fund manually.');
      console.log('solana airdrop 2', payer.publicKey.toBase58(), '--url devnet');
      return;
    }
  }

  // Check if mints already exist
  const crapMintPk = new PublicKey(CRAP_MINT);
  const rngMintPk = new PublicKey(RNG_MINT);

  const crapAccount = await connection.getAccountInfo(crapMintPk);
  const rngAccount = await connection.getAccountInfo(rngMintPk);

  console.log('\nCRAP_MINT (' + CRAP_MINT + '):', crapAccount ? 'EXISTS' : 'NOT FOUND');
  console.log('RNG_MINT (' + RNG_MINT + '):', rngAccount ? 'EXISTS' : 'NOT FOUND');

  if (crapAccount && rngAccount) {
    console.log('\nBoth mints already exist on devnet!');
    return;
  }

  // The issue: We cannot create accounts at specific addresses without the keypair
  // SPL Token mints are created at the address derived from the mint keypair
  // Since CRAPqnVV... and RNGqnVV... are vanity addresses, we'd need those specific keypairs

  console.log('\n=== CRITICAL ISSUE ===');
  console.log('Cannot create token mints at vanity addresses without the original keypairs.');
  console.log('');
  console.log('Options:');
  console.log('1. Use the original vanity keypairs (if available) to create the mints');
  console.log('2. Modify the program to use different mint addresses for devnet');
  console.log('3. Use solana-test-validator to write accounts directly (localnet only)');
  console.log('');
  console.log('To create new devnet-specific mints, run:');
  console.log('  spl-token create-token --url devnet');
  console.log('');
  console.log('Then update src/lib/solana.ts with the new addresses for devnet.');
}

main().catch(console.error);
