/**
 * Fix TCP (Three Card Poker) corrupted position
 *
 * The position is in state=1 (Betting) with ante=0, pair_plus=0 but pending_winnings=1
 * We'll place a bet, deal, fold, claim to reset it properly
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SYSVAR_SLOT_HASHES_PUBKEY } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

// Constants
const DEVNET_RPC = 'https://api.devnet.solana.com';
const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
const TCP_MINT = new PublicKey('8TbNcDfhLh86XZC1gVb7xFSVpTmhGnvLq3f6d7xZrGYS');

// Seeds
const THREECARD_GAME = Buffer.from([116, 99, 112, 103, 97, 109, 101]); // "tcpgame"
const THREECARD_POSITION = Buffer.from([116, 99, 112, 112, 111, 115]); // "tcppos"
const THREECARD_VAULT = Buffer.from([116, 99, 112, 118, 97, 117, 108, 116]); // "tcpvault"

// Instruction opcodes
const PLACE_THREECARD_BET = 58;
const DEAL_THREECARD = 59;
const FOLD_THREECARD = 61;
const CLAIM_THREECARD_WINNINGS = 62;

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  // Load payer keypair
  const payerPath = process.env.PAYER_KEYPAIR || '/home/r/.config/solana/id.json';
  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(payerPath, 'utf-8')))
  );
  console.log('Payer:', payerKeypair.publicKey.toBase58());

  // Derive PDAs
  const [threecardGame] = PublicKey.findProgramAddressSync([THREECARD_GAME], ORE_PROGRAM_ID);
  const [threecardPosition] = PublicKey.findProgramAddressSync([THREECARD_POSITION, payerKeypair.publicKey.toBytes()], ORE_PROGRAM_ID);
  const [threecardVault] = PublicKey.findProgramAddressSync([THREECARD_VAULT], ORE_PROGRAM_ID);

  console.log('ThreeCard Game:', threecardGame.toBase58());
  console.log('ThreeCard Position:', threecardPosition.toBase58());
  console.log('ThreeCard Vault:', threecardVault.toBase58());

  // Get ATAs
  const signerTcpAta = await getAssociatedTokenAddress(TCP_MINT, payerKeypair.publicKey);
  const vaultTcpAta = await getAssociatedTokenAddress(TCP_MINT, threecardVault, true);

  console.log('Signer TCP ATA:', signerTcpAta.toBase58());
  console.log('Vault TCP ATA:', vaultTcpAta.toBase58());

  // Check current position state
  console.log('\n--- Checking Current Position State ---');
  const positionInfo = await connection.getAccountInfo(threecardPosition);
  if (positionInfo) {
    const data = positionInfo.data;
    const state = data[72]; // offset for state field
    const ante = data.readBigUInt64LE(80);
    const play = data.readBigUInt64LE(88);
    const pairPlus = data.readBigUInt64LE(96);
    const pendingWinnings = data.readBigUInt64LE(112);

    console.log('State:', state, state === 0 ? '(None)' : state === 1 ? '(Betting)' : state === 2 ? '(Dealt)' : state === 3 ? '(Settled)' : '(Unknown)');
    console.log('Ante:', Number(ante) / 1e9, 'TCP');
    console.log('Play:', Number(play) / 1e9, 'TCP');
    console.log('Pair Plus:', Number(pairPlus) / 1e9, 'TCP');
    console.log('Pending Winnings:', Number(pendingWinnings) / 1e9, 'TCP');

    // Decide what to do based on state
    if (state === 3) {
      console.log('\n--- Position is SETTLED, claiming winnings ---');
      await claimWinnings(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
    } else if (state === 2) {
      console.log('\n--- Position is DEALT, folding ---');
      await fold(connection, payerKeypair, threecardGame, threecardPosition);
      // After fold, claim if there are winnings
      await claimWinnings(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
    } else if (state === 1) {
      if (ante === 0n && pairPlus === 0n) {
        console.log('\n--- Position is BETTING with no bets, placing bet ---');
        await placeBet(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
        console.log('\n--- Dealing cards ---');
        await deal(connection, payerKeypair, threecardGame, threecardPosition);
        console.log('\n--- Folding ---');
        await fold(connection, payerKeypair, threecardGame, threecardPosition);
        console.log('\n--- Claiming winnings ---');
        await claimWinnings(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
      } else {
        console.log('\n--- Position has active bets, dealing ---');
        await deal(connection, payerKeypair, threecardGame, threecardPosition);
        console.log('\n--- Folding ---');
        await fold(connection, payerKeypair, threecardGame, threecardPosition);
        console.log('\n--- Claiming winnings ---');
        await claimWinnings(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
      }
    } else if (state === 0) {
      console.log('\n--- Position is NONE, starting fresh ---');
      await placeBet(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
      await deal(connection, payerKeypair, threecardGame, threecardPosition);
      await fold(connection, payerKeypair, threecardGame, threecardPosition);
      await claimWinnings(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
    }
  } else {
    console.log('Position does not exist');
  }

  // Final state check
  console.log('\n--- Final Position State ---');
  const finalInfo = await connection.getAccountInfo(threecardPosition);
  if (finalInfo) {
    const data = finalInfo.data;
    const state = data[72];
    const ante = data.readBigUInt64LE(80);
    const pendingWinnings = data.readBigUInt64LE(112);
    console.log('State:', state);
    console.log('Ante:', Number(ante) / 1e9, 'TCP');
    console.log('Pending Winnings:', Number(pendingWinnings) / 1e9, 'TCP');
  }
}

async function placeBet(connection, payer, game, position, vault, signerAta, vaultAta) {
  // PlaceThreeCardBet: ante (8 bytes) + pair_plus (8 bytes)
  const anteAmount = BigInt(1_000_000_000); // 1 TCP
  const pairPlusAmount = BigInt(0);

  const data = Buffer.alloc(17);
  data[0] = PLACE_THREECARD_BET;
  data.writeBigUInt64LE(anteAmount, 1);
  data.writeBigUInt64LE(pairPlusAmount, 9);

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: TCP_MINT, isSigner: false, isWritable: false },
      { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(payer);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('PlaceBet tx:', sig);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('PlaceBet SUCCESS');
  } catch (e) {
    console.log('PlaceBet FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
  }
}

async function deal(connection, payer, game, position) {
  // DealThreeCard: round_id (8 bytes)
  const roundId = BigInt(Date.now());

  const data = Buffer.alloc(9);
  data[0] = DEAL_THREECARD;
  data.writeBigUInt64LE(roundId, 1);

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(payer);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('Deal tx:', sig);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Deal SUCCESS');
  } catch (e) {
    console.log('Deal FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
  }
}

async function fold(connection, payer, game, position) {
  // FoldThreeCard: no additional data
  const data = Buffer.alloc(1);
  data[0] = FOLD_THREECARD;

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(payer);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('Fold tx:', sig);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Fold SUCCESS');
  } catch (e) {
    console.log('Fold FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
  }
}

async function claimWinnings(connection, payer, game, position, vault, signerAta, vaultAta) {
  // ClaimThreeCardWinnings: no additional data
  const data = Buffer.alloc(1);
  data[0] = CLAIM_THREECARD_WINNINGS;

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: game, isSigner: false, isWritable: true },
      { pubkey: position, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.sign(payer);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('Claim tx:', sig);
    await connection.confirmTransaction(sig, 'confirmed');
    console.log('Claim SUCCESS');
  } catch (e) {
    console.log('Claim FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
  }
}

main().catch(console.error);
