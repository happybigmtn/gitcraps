/**
 * Full TCP (Three Card Poker) test cycle
 * Place bet → Deal → Fold → Claim
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SYSVAR_SLOT_HASHES_PUBKEY } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

// Constants
const DEVNET_RPC = 'https://api.devnet.solana.com';
const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
const TCP_MINT = new PublicKey('3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth');

// Seeds (from api/src/consts.rs)
const THREECARD_GAME = Buffer.from('threecard_game');
const THREECARD_POSITION = Buffer.from('threecard_position');
const THREECARD_VAULT = Buffer.from('threecard_vault');

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

  // Check SOL balance
  const solBalance = await connection.getBalance(payerKeypair.publicKey);
  console.log('SOL Balance:', solBalance / 1e9, 'SOL');

  // Derive PDAs
  const [threecardGame] = PublicKey.findProgramAddressSync([THREECARD_GAME], ORE_PROGRAM_ID);
  const [threecardPosition] = PublicKey.findProgramAddressSync([THREECARD_POSITION, payerKeypair.publicKey.toBytes()], ORE_PROGRAM_ID);
  const [threecardVault] = PublicKey.findProgramAddressSync([THREECARD_VAULT], ORE_PROGRAM_ID);

  console.log('\nThreeCard Game:', threecardGame.toBase58());
  console.log('ThreeCard Position:', threecardPosition.toBase58());
  console.log('ThreeCard Vault:', threecardVault.toBase58());

  // Get ATAs
  const signerTcpAta = await getAssociatedTokenAddress(TCP_MINT, payerKeypair.publicKey);
  const vaultTcpAta = await getAssociatedTokenAddress(TCP_MINT, threecardVault, true);

  console.log('Signer TCP ATA:', signerTcpAta.toBase58());
  console.log('Vault TCP ATA:', vaultTcpAta.toBase58());

  // Check TCP balance
  try {
    const tcpAccount = await connection.getTokenAccountBalance(signerTcpAta);
    console.log('TCP Balance:', tcpAccount.value.uiAmount, 'TCP');
  } catch {
    console.log('TCP Balance: 0 (no ATA)');
  }

  // Check game state
  console.log('\n=== Checking ThreeCard Game State ===');
  const gameInfo = await connection.getAccountInfo(threecardGame);
  if (gameInfo) {
    const data = gameInfo.data;
    const houseBankroll = data.readBigUInt64LE(8);
    const reservedPayouts = data.readBigUInt64LE(16);
    const totalWagered = data.readBigUInt64LE(24);
    const totalPaid = data.readBigUInt64LE(32);
    console.log('House Bankroll:', Number(houseBankroll) / 1e9, 'TCP');
    console.log('Reserved Payouts:', Number(reservedPayouts) / 1e9, 'TCP');
    console.log('Total Wagered:', Number(totalWagered) / 1e9, 'TCP');
    console.log('Total Paid:', Number(totalPaid) / 1e9, 'TCP');
    console.log('Available:', (Number(houseBankroll) - Number(reservedPayouts)) / 1e9, 'TCP');
  } else {
    console.log('ThreeCard Game does not exist yet');
  }

  // Step 1: Place bet
  console.log('\n=== Step 1: Place Bet ===');
  const betResult = await placeBet(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
  if (!betResult) {
    console.log('Bet failed, stopping');
    return;
  }

  // Check position state after bet
  await checkPosition(connection, threecardPosition);

  // Step 2: Deal
  console.log('\n=== Step 2: Deal Cards ===');
  const dealResult = await deal(connection, payerKeypair, threecardGame, threecardPosition);
  if (!dealResult) {
    console.log('Deal failed, stopping');
    return;
  }

  // Check position state after deal
  await checkPosition(connection, threecardPosition);

  // Step 3: Fold
  console.log('\n=== Step 3: Fold ===');
  const foldResult = await fold(connection, payerKeypair, threecardGame, threecardPosition);
  if (!foldResult) {
    console.log('Fold failed, stopping');
    return;
  }

  // Check position state after fold
  const finalState = await checkPosition(connection, threecardPosition);

  // Step 4: Claim if there are winnings
  if (finalState && finalState.pendingWinnings > 0n) {
    console.log('\n=== Step 4: Claim Winnings ===');
    await claimWinnings(connection, payerKeypair, threecardGame, threecardPosition, threecardVault, signerTcpAta, vaultTcpAta);
    await checkPosition(connection, threecardPosition);
  } else {
    console.log('\n=== Step 4: No winnings to claim ===');
  }

  console.log('\n=== TCP Test Complete ===');
}

async function checkPosition(connection, position) {
  const info = await connection.getAccountInfo(position);
  if (!info) {
    console.log('Position: Does not exist');
    return null;
  }
  const data = info.data;
  const state = data[72];
  const ante = data.readBigUInt64LE(80);
  const play = data.readBigUInt64LE(88);
  const pairPlus = data.readBigUInt64LE(96);
  const totalWagered = data.readBigUInt64LE(104);
  const pendingWinnings = data.readBigUInt64LE(112);
  const totalLost = data.readBigUInt64LE(120);
  const playerCards = [data[128], data[129], data[130]];
  const dealerCards = [data[131], data[132], data[133]];
  const playerHandRank = data[134];
  const dealerHandRank = data[135];
  const dealerQualifies = data[136];

  const stateNames = ['None', 'Betting', 'Dealt', 'Settled'];
  const rankNames = ['High Card', 'Pair', 'Flush', 'Straight', 'Three of a Kind', 'Straight Flush'];

  console.log('Position State:', stateNames[state] || `Unknown(${state})`);
  console.log('  Ante:', Number(ante) / 1e9, 'TCP');
  console.log('  Play:', Number(play) / 1e9, 'TCP');
  console.log('  Pair Plus:', Number(pairPlus) / 1e9, 'TCP');
  console.log('  Total Wagered:', Number(totalWagered) / 1e9, 'TCP');
  console.log('  Pending Winnings:', Number(pendingWinnings) / 1e9, 'TCP');
  console.log('  Total Lost:', Number(totalLost) / 1e9, 'TCP');
  if (state >= 2) {
    console.log('  Player Cards:', playerCards.map(c => c === 255 ? '-' : `${c % 13}${['♠', '♥', '♦', '♣'][Math.floor(c / 13)]}`).join(' '));
    console.log('  Dealer Cards:', dealerCards.map(c => c === 255 ? '-' : `${c % 13}${['♠', '♥', '♦', '♣'][Math.floor(c / 13)]}`).join(' '));
    console.log('  Player Hand:', rankNames[playerHandRank] || `Unknown(${playerHandRank})`);
    console.log('  Dealer Hand:', rankNames[dealerHandRank] || `Unknown(${dealerHandRank})`);
    console.log('  Dealer Qualifies:', dealerQualifies === 1 ? 'Yes' : 'No');
  }

  return { state, ante, play, pairPlus, pendingWinnings };
}

async function placeBet(connection, payer, game, position, vault, signerAta, vaultAta) {
  // PlaceThreeCardBet: ante (8 bytes) + pair_plus (8 bytes)
  const anteAmount = BigInt(1_000_000_000); // 1 TCP
  const pairPlusAmount = BigInt(500_000_000); // 0.5 TCP

  const data = Buffer.alloc(17);
  data[0] = PLACE_THREECARD_BET;
  data.writeBigUInt64LE(anteAmount, 1);
  data.writeBigUInt64LE(pairPlusAmount, 9);

  console.log(`Placing bet: ante=${Number(anteAmount) / 1e9} TCP, pair_plus=${Number(pairPlusAmount) / 1e9} TCP`);

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
    return true;
  } catch (e) {
    console.log('PlaceBet FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
    return false;
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
    return true;
  } catch (e) {
    console.log('Deal FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
    return false;
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
    return true;
  } catch (e) {
    console.log('Fold FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
    return false;
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
    return true;
  } catch (e) {
    console.log('Claim FAILED:', e.message);
    if (e.logs) console.log('Logs:', e.logs.join('\n'));
    return false;
  }
}

main().catch(console.error);
