/**
 * Resolve TCP Position - Deal and Fold to reset
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SYSVAR_SLOT_HASHES_PUBKEY } from '@solana/web3.js';
import fs from 'fs';

const DEVNET_RPC = 'https://api.devnet.solana.com';
const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');

const THREECARD_GAME = Buffer.from('threecard_game');
const THREECARD_POSITION = Buffer.from('threecard_position');

const DEAL_THREECARD = 59;
const FOLD_THREECARD = 61;

async function main() {
  const connection = new Connection(DEVNET_RPC, 'confirmed');

  const payerKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync('/home/r/.config/solana/id.json', 'utf-8')))
  );
  console.log('Payer:', payerKeypair.publicKey.toBase58());

  const [threecardGame] = PublicKey.findProgramAddressSync([THREECARD_GAME], ORE_PROGRAM_ID);
  const [threecardPosition] = PublicKey.findProgramAddressSync([THREECARD_POSITION, payerKeypair.publicKey.toBytes()], ORE_PROGRAM_ID);

  console.log('ThreeCard Game:', threecardGame.toBase58());
  console.log('ThreeCard Position:', threecardPosition.toBase58());

  // Step 1: Deal
  console.log('\n=== Step 1: Deal ===');
  const roundId = BigInt(Date.now());
  const dealData = Buffer.alloc(9);
  dealData[0] = DEAL_THREECARD;
  dealData.writeBigUInt64LE(roundId, 1);

  const dealIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: payerKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: threecardGame, isSigner: false, isWritable: true },
      { pubkey: threecardPosition, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: dealData,
  });

  try {
    const dealTx = new Transaction().add(dealIx);
    dealTx.feePayer = payerKeypair.publicKey;
    dealTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    dealTx.sign(payerKeypair);
    const dealSig = await connection.sendRawTransaction(dealTx.serialize());
    console.log('Deal tx:', dealSig);
    await connection.confirmTransaction(dealSig, 'confirmed');
    console.log('Deal SUCCESS');
  } catch (e) {
    console.log('Deal FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
    return;
  }

  // Check state after deal
  await checkPosition(connection, threecardPosition);

  // Step 2: Fold
  console.log('\n=== Step 2: Fold ===');
  const foldData = Buffer.alloc(1);
  foldData[0] = FOLD_THREECARD;

  const foldIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: payerKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: threecardGame, isSigner: false, isWritable: true },
      { pubkey: threecardPosition, isSigner: false, isWritable: true },
    ],
    data: foldData,
  });

  try {
    const foldTx = new Transaction().add(foldIx);
    foldTx.feePayer = payerKeypair.publicKey;
    foldTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    foldTx.sign(payerKeypair);
    const foldSig = await connection.sendRawTransaction(foldTx.serialize());
    console.log('Fold tx:', foldSig);
    await connection.confirmTransaction(foldSig, 'confirmed');
    console.log('Fold SUCCESS');
  } catch (e) {
    console.log('Fold FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
    return;
  }

  // Check final state
  await checkPosition(connection, threecardPosition);
  console.log('\n=== TCP Position Resolved ===');
}

async function checkPosition(connection, position) {
  const info = await connection.getAccountInfo(position);
  if (!info) {
    console.log('Position: Does not exist');
    return;
  }
  const data = info.data;
  const offset = 8; // discriminator

  const state = data[offset + 48];
  const ante = data.readBigUInt64LE(offset + 56);
  const play = data.readBigUInt64LE(offset + 64);
  const pair_plus = data.readBigUInt64LE(offset + 72);
  const pending_winnings = data.readBigUInt64LE(offset + 96);

  const stateNames = ['Betting', 'Dealt', 'Decided', 'Settled'];
  console.log('Position State:', state, '(' + (stateNames[state] || 'Unknown') + ')');
  console.log('  Ante:', Number(ante) / 1e9, 'TCP');
  console.log('  Play:', Number(play) / 1e9, 'TCP');
  console.log('  Pair Plus:', Number(pair_plus) / 1e9, 'TCP');
  console.log('  Pending Winnings:', Number(pending_winnings) / 1e9, 'TCP');
  console.log('  has_active_bets():', Number(ante + play + pair_plus) > 0);
}

main().catch(console.error);
