/**
 * Start Mining Round on Devnet
 * Admin-only instruction to restart the board slot window
 */
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import fs from 'fs';

const RPC = 'https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7';
const connection = new Connection(RPC, 'confirmed');

const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
const ADMIN_ADDRESS = new PublicKey('gUHM7aKpe5grLDvZq3sBMAwP68rwnPe5NJnULBc5t2C');

function loadKeypair() {
  const keypairPath = '/home/r/.config/solana/id.json';
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('board')], ORE_PROGRAM_ID);
}

function configPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('config')], ORE_PROGRAM_ID);
}

function roundPDA(roundId) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync([Buffer.from('round'), buffer], ORE_PROGRAM_ID);
}

async function startRound() {
  console.log('=== Starting Mining Round on Devnet ===\n');
  
  const signer = loadKeypair();
  console.log('Signer:', signer.publicKey.toString());
  console.log('Admin:', ADMIN_ADDRESS.toString());
  
  if (!signer.publicKey.equals(ADMIN_ADDRESS)) {
    console.error('ERROR: Signer is not the admin!');
    process.exit(1);
  }
  
  // Get board to find current round
  const [boardAddress] = boardPDA();
  const [configAddress] = configPDA();
  
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) {
    console.error('Board not initialized!');
    process.exit(1);
  }
  
  const roundId = boardInfo.data.readBigUInt64LE(8);
  const startSlot = boardInfo.data.readBigUInt64LE(16);
  const endSlot = boardInfo.data.readBigUInt64LE(24);
  
  console.log('Current round ID:', roundId.toString());
  console.log('Old start_slot:', startSlot.toString());
  console.log('Old end_slot:', endSlot.toString());
  
  const [roundAddress] = roundPDA(roundId);
  console.log('Round PDA:', roundAddress.toString());
  
  // StartRound instruction: discriminator(22) + duration(8 bytes)
  const DURATION = 150n; // 150 slots ~ 1 minute
  const data = Buffer.alloc(9);
  data[0] = 22; // StartRound discriminator
  data.writeBigUInt64LE(DURATION, 1);
  
  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
    ],
    data,
  });
  
  const tx = new Transaction().add(ix);
  tx.feePayer = signer.publicKey;
  
  console.log('\nSimulating StartRound...');
  const sim = await connection.simulateTransaction(tx, [signer]);
  if (sim.value.err) {
    console.log('Simulation failed:', JSON.stringify(sim.value.err));
    sim.value.logs?.forEach(log => console.log('  ', log));
    process.exit(1);
  }
  console.log('Simulation passed!');
  sim.value.logs?.slice(-5).forEach(log => console.log('  ', log));
  
  console.log('\nSending StartRound transaction...');
  const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
  console.log('SUCCESS! Signature:', sig);
  
  // Verify
  const newBoardInfo = await connection.getAccountInfo(boardAddress);
  const newStartSlot = newBoardInfo.data.readBigUInt64LE(16);
  const newEndSlot = newBoardInfo.data.readBigUInt64LE(24);
  
  console.log('\n=== Updated Board State ===');
  console.log('New start_slot:', newStartSlot.toString());
  console.log('New end_slot:', newEndSlot.toString());
  
  const currentSlot = await connection.getSlot();
  console.log('Current slot:', currentSlot);
  console.log('Slot window valid?', currentSlot >= newStartSlot && currentSlot < newEndSlot);
}

startRound().catch(console.error);
