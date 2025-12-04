#!/usr/bin/env node

/**
 * Test script for AMM Fee Distribution to Stakers
 *
 * Tests the flow:
 * 0. Migrate Treasury account to new size (with RNG fields)
 * 1. Check current exchange pool state
 * 2. Distribute fees to stakers
 * 3. (Optional) Claim RNG yield as a staker
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount
} from '@solana/spl-token';
import * as fs from 'fs';

// Program and mint addresses
const PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
// Devnet RNG mint address - must match program's consts.rs with devnet feature
const RNG_MINT = new PublicKey('8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs');

// Seeds
const EXCHANGE_POOL_SEED = Buffer.from('exchange_pool');
const EXCHANGE_RNG_VAULT_SEED = Buffer.from('exchange_rng_vault');
const EXCHANGE_SOL_VAULT_SEED = Buffer.from('exchange_sol_vault');
const TREASURY_SEED = Buffer.from('treasury');
const STAKE_SEED = Buffer.from('stake');

// Instruction discriminators
const SWAP_SOL_TO_RNG = 79;
const SWAP_RNG_TO_SOL = 80;
const DISTRIBUTE_EXCHANGE_FEES = 84;
const CLAIM_RNG_YIELD = 85;
const MIGRATE_TREASURY = 86;
const MIGRATE_STAKE = 87;

// Helper to derive PDAs
function findPda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

// Load keypair from file
function loadKeypair(path) {
  const secretKey = JSON.parse(fs.readFileSync(path, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

async function main() {
  console.log('=== AMM Fee Distribution Test ===\n');

  // Connect to devnet
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

  // Load payer keypair
  const payerPath = process.env.KEYPAIR_PATH || `${process.env.HOME}/.config/solana/id.json`;
  const payer = loadKeypair(payerPath);
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  // Derive PDAs
  const exchangePool = findPda([EXCHANGE_POOL_SEED]);
  const rngVault = findPda([EXCHANGE_RNG_VAULT_SEED]);
  const solVault = findPda([EXCHANGE_SOL_VAULT_SEED]);
  const treasury = findPda([TREASURY_SEED]);
  const stake = findPda([STAKE_SEED, payer.publicKey.toBuffer()]);

  console.log(`Exchange Pool: ${exchangePool.toBase58()}`);
  console.log(`Treasury: ${treasury.toBase58()}`);
  console.log(`Stake: ${stake.toBase58()}`);

  // Get token accounts
  const payerRngAta = await getAssociatedTokenAddress(RNG_MINT, payer.publicKey);
  const treasuryRngAta = await getAssociatedTokenAddress(RNG_MINT, treasury, true);

  // Check exchange pool state
  console.log('\n--- Checking Exchange Pool State ---');
  try {
    const poolAccount = await connection.getAccountInfo(exchangePool);
    if (poolAccount) {
      // Parse pool data
      // Layout: 8 discriminator + 128 (4 pubkeys) + u64 fields
      // sol_reserve (8) + rng_reserve (8) + k_low (8) + k_high (8) + total_lp_supply (8)
      // + fee_numerator (8) + fee_denominator (8) + protocol_fees_sol (8) + protocol_fees_rng (8)
      const data = poolAccount.data;
      const protocolFeesSolOffset = 8 + 128 + 7*8; // After 7 u64s
      const protocolFeesRngOffset = 8 + 128 + 8*8; // After 8 u64s
      const protocolFeesSol = data.readBigUInt64LE(protocolFeesSolOffset);
      const protocolFeesRng = data.readBigUInt64LE(protocolFeesRngOffset);
      console.log(`Protocol Fees SOL: ${Number(protocolFeesSol) / LAMPORTS_PER_SOL} SOL`);
      console.log(`Protocol Fees RNG: ${Number(protocolFeesRng) / 1e9} RNG`);
    } else {
      console.log('Exchange pool not initialized');
    }
  } catch (e) {
    console.log(`Error reading pool: ${e.message}`);
  }

  // Check stake account
  console.log('\n--- Checking Stake Account ---');
  try {
    const stakeAccount = await connection.getAccountInfo(stake);
    if (stakeAccount) {
      console.log(`Stake account exists, size: ${stakeAccount.data.length} bytes`);
      // Parse stake data - the RNG rewards should be near the end
      // Stake layout: authority(32) + id(8) + balance(64) + rewards(64) + ... + rng fields
    } else {
      console.log('Stake account not found - need to stake first');
    }
  } catch (e) {
    console.log(`Error reading stake: ${e.message}`);
  }

  // Step 0: Migrate Treasury account
  console.log('\n--- Step 0: Migrate Treasury Account ---');
  try {
    const treasuryAccount = await connection.getAccountInfo(treasury);
    console.log(`Treasury current size: ${treasuryAccount?.data.length} bytes`);

    const migrateIx = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      data: Buffer.from([MIGRATE_TREASURY])
    };

    const tx = new Transaction().add(migrateIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { skipPreflight: true });
    console.log(`Migration tx: ${sig}`);

    // Verify new size
    const newTreasury = await connection.getAccountInfo(treasury);
    console.log(`Treasury new size: ${newTreasury?.data.length} bytes`);
  } catch (e) {
    console.log(`Migration failed: ${e.message}`);
    if (e.logs) {
      console.log('Logs:', e.logs.slice(-5).join('\n'));
    }
  }

  // Step 1: Execute an RNG→SOL swap to accumulate RNG protocol fees
  console.log('\n--- Step 1: Execute RNG→SOL Swap to Accumulate RNG Fees ---');
  try {
    // First check if payer has RNG tokens
    try {
      const rngAccount = await getAccount(connection, payerRngAta);
      console.log(`Payer RNG balance: ${Number(rngAccount.amount) / 1e9} RNG`);

      if (Number(rngAccount.amount) < 1e9) {
        console.log('Not enough RNG to swap, skipping swap step');
        throw new Error('Insufficient RNG balance');
      }
    } catch (e) {
      if (e.message !== 'Insufficient RNG balance') {
        console.log('Payer has no RNG ATA, need to get some RNG first');
        console.log('Skipping swap step...');
        throw e;
      }
      throw e;
    }

    const rngAmount = BigInt(1e9); // 1 RNG token (9 decimals)

    // wSOL mint address
    const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
    const payerSolAta = await getAssociatedTokenAddress(SOL_MINT, payer.publicKey);

    // SwapRngToSol accounts from sdk.rs (10 accounts)
    const swapIx = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: exchangePool, isSigner: false, isWritable: true },
        { pubkey: solVault, isSigner: false, isWritable: true },
        { pubkey: rngVault, isSigner: false, isWritable: true },
        { pubkey: payerSolAta, isSigner: false, isWritable: true },
        { pubkey: payerRngAta, isSigner: false, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: false },
        { pubkey: SOL_MINT, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.concat([
        Buffer.from([SWAP_RNG_TO_SOL]),
        Buffer.from(new BigUint64Array([rngAmount]).buffer),
        Buffer.from(new BigUint64Array([BigInt(0)]).buffer), // min_sol_out (0 = accept any)
      ])
    };

    const tx = new Transaction().add(swapIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { skipPreflight: true });
    console.log(`Swap tx: ${sig}`);

    // Wait and re-check pool
    await new Promise(r => setTimeout(r, 2000));
    const poolAccount = await connection.getAccountInfo(exchangePool);
    if (poolAccount) {
      const data = poolAccount.data;
      // protocol_fees_rng is at offset 8 (discriminator) + 128 (4 pubkeys) + 64 (8 u64s) = 200
      const protocolFeesRng = data.readBigUInt64LE(200);
      console.log(`Protocol Fees RNG after swap: ${Number(protocolFeesRng) / 1e9} RNG`);
    }
  } catch (e) {
    console.log(`Swap failed: ${e.message}`);
    console.log('Continuing without swap...');
  }

  // Step 2: Distribute fees to stakers
  console.log('\n--- Step 2: Distribute Fees to Stakers ---');
  try {
    const distributeIx = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: exchangePool, isSigner: false, isWritable: true },
        { pubkey: rngVault, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: treasuryRngAta, isSigner: false, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      ],
      data: Buffer.from([DISTRIBUTE_EXCHANGE_FEES])
    };

    const tx = new Transaction().add(distributeIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { skipPreflight: true });
    console.log(`Distribute tx: ${sig}`);
    console.log('Fees distributed to stakers successfully!');
  } catch (e) {
    console.log(`Distribution failed: ${e.message}`);
    if (e.logs) {
      console.log('Logs:', e.logs.slice(-5).join('\n'));
    }
  }

  // Step 3: Claim RNG yield as staker
  console.log('\n--- Step 3: Claim RNG Yield ---');
  try {
    // Check if stake exists first
    const stakeAccount = await connection.getAccountInfo(stake);
    if (!stakeAccount) {
      console.log('No stake account found. Need to stake first to claim RNG yield.');
      return;
    }

    const claimIx = {
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: RNG_MINT, isSigner: false, isWritable: false },
        { pubkey: payerRngAta, isSigner: false, isWritable: true },
        { pubkey: stake, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: true },
        { pubkey: treasuryRngAta, isSigner: false, isWritable: true },
        { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: Buffer.from([
        CLAIM_RNG_YIELD,
        ...new Uint8Array(new BigUint64Array([BigInt(0)]).buffer), // 0 = claim all
      ])
    };

    const tx = new Transaction().add(claimIx);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], { skipPreflight: true });
    console.log(`Claim tx: ${sig}`);
    console.log('RNG yield claimed successfully!');

    // Check RNG balance
    try {
      const rngAccount = await getAccount(connection, payerRngAta);
      console.log(`RNG balance: ${Number(rngAccount.amount) / 1e11} RNG`);
    } catch (e) {
      console.log('Could not read RNG balance');
    }
  } catch (e) {
    console.log(`Claim failed: ${e.message}`);
    if (e.logs) {
      console.log('Logs:', e.logs.slice(-5).join('\n'));
    }
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);
