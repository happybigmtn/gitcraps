/**
 * Test Mining (Deploy) Functionality on Devnet
 */
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const RPC = 'https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7';
const connection = new Connection(RPC, 'confirmed');

// Program IDs
const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
const RNG_MINT = new PublicKey('8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs'); // Devnet mint
const ENTROPY_PROGRAM_ID = new PublicKey('EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1');

function loadKeypair() {
  const keypairPath = '/home/r/.config/solana/id.json';
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from('board')], ORE_PROGRAM_ID);
}

function roundPDA(roundId) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync([Buffer.from('round'), buffer], ORE_PROGRAM_ID);
}

function minerPDA(authority) {
  return PublicKey.findProgramAddressSync([Buffer.from('miner'), authority.toBuffer()], ORE_PROGRAM_ID);
}

function automationPDA(authority) {
  return PublicKey.findProgramAddressSync([Buffer.from('automation'), authority.toBuffer()], ORE_PROGRAM_ID);
}

function entropyVarPDA(board, index) {
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync([Buffer.from('entropy_var'), board.toBuffer(), indexBuffer], ORE_PROGRAM_ID);
}

function squaresToMask(squares) {
  let mask = 0n;
  for (let i = 0; i < squares.length; i++) {
    if (squares[i]) mask |= (1n << BigInt(i));
  }
  return mask;
}

function toLeBytes(value, bytes) {
  const result = new Uint8Array(bytes);
  let v = BigInt(value);
  for (let i = 0; i < bytes; i++) {
    result[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return result;
}

async function createDeployInstruction(signer, authority, amount, roundId, squares, dicePrediction = 0) {
  const [automationAddress] = automationPDA(authority);
  const [boardAddress] = boardPDA();
  const [minerAddress] = minerPDA(authority);
  const [roundAddress] = roundPDA(roundId);
  const [entropyVarAddress] = entropyVarPDA(boardAddress, 0n);

  const signerRngAta = await getAssociatedTokenAddress(RNG_MINT, signer, false, TOKEN_PROGRAM_ID);
  const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundAddress, true);

  const mask = squaresToMask(squares);
  const data = new Uint8Array(25);
  data[0] = 6; // OreInstruction.Deploy = 6
  data.set(toLeBytes(amount, 8), 1);
  data.set(toLeBytes(mask, 8), 9);
  data[17] = dicePrediction;

  const keys = [
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: automationAddress, isSigner: false, isWritable: true },
    { pubkey: boardAddress, isSigner: false, isWritable: true },
    { pubkey: minerAddress, isSigner: false, isWritable: true },
    { pubkey: roundAddress, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    { pubkey: signerRngAta, isSigner: false, isWritable: true },
    { pubkey: roundRngAta, isSigner: false, isWritable: true },
    { pubkey: RNG_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: entropyVarAddress, isSigner: false, isWritable: true },
    { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return { programId: ORE_PROGRAM_ID, keys, data: Buffer.from(data) };
}

async function testMiningDevnet() {
  console.log('=== Testing Mining (Deploy) on Devnet ===\n');

  const signer = loadKeypair();
  console.log('Signer:', signer.publicKey.toString());

  // Check board
  const [boardAddress] = boardPDA();
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) {
    console.error('Board not initialized on devnet!');
    process.exit(1);
  }

  const roundId = boardInfo.data.readBigUInt64LE(8);
  console.log('Current round ID:', roundId.toString());

  // Check RNG balance
  const signerRngAta = await getAssociatedTokenAddress(RNG_MINT, signer.publicKey);
  try {
    const balance = await connection.getTokenAccountBalance(signerRngAta);
    console.log('RNG balance:', balance.value.uiAmountString);
    if (!balance.value.uiAmount || balance.value.uiAmount < 1) {
      console.log('Not enough RNG tokens. Need at least 1 RNG.');
      process.exit(1);
    }
  } catch (e) {
    console.error('No RNG token account. Use faucet first.');
    process.exit(1);
  }

  // Check/create round RNG ATA
  const [roundAddress] = roundPDA(roundId);
  const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundAddress, true);
  const roundRngAtaInfo = await connection.getAccountInfo(roundRngAta);

  if (!roundRngAtaInfo) {
    console.log('\nCreating round RNG ATA...');
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(signer.publicKey, roundRngAta, roundAddress, RNG_MINT)
    );
    await sendAndConfirmTransaction(connection, createAtaTx, [signer]);
    console.log('Round RNG ATA created');
  }

  // Select squares (6 squares for testing)
  const selectedSquares = new Array(36).fill(false);
  selectedSquares[0] = true;  // (1,1) = 2
  selectedSquares[1] = true;  // (1,2) = 3
  selectedSquares[2] = true;  // (1,3) = 4
  selectedSquares[6] = true;  // (2,1) = 3
  selectedSquares[7] = true;  // (2,2) = 4
  selectedSquares[8] = true;  // (2,3) = 5

  const deployAmount = 1_000_000_000n; // 1 RNG

  console.log('\n--- Testing Deploy ---');
  console.log('Squares:', selectedSquares.filter(Boolean).length);
  console.log('Amount:', Number(deployAmount) / 1e9, 'RNG');

  try {
    const deployIx = await createDeployInstruction(
      signer.publicKey, signer.publicKey, deployAmount, roundId, selectedSquares
    );

    const tx = new Transaction().add(deployIx);
    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = signer.publicKey;

    // Simulate first
    const sim = await connection.simulateTransaction(tx, [signer]);
    if (sim.value.err) {
      console.log('Simulation failed:');
      sim.value.logs?.slice(-8).forEach(log => console.log('  ', log));
      return false;
    }
    console.log('Simulation passed');

    console.log('Sending Deploy transaction...');
    const signature = await sendAndConfirmTransaction(connection, tx, [signer]);
    console.log('Deploy SUCCESS! Sig:', signature.slice(0, 40) + '...');

    // Check balances
    const signerBalance = await connection.getTokenAccountBalance(signerRngAta);
    const roundBalance = await connection.getTokenAccountBalance(roundRngAta);
    console.log('\n--- Balances ---');
    console.log('Signer RNG:', signerBalance.value.uiAmountString);
    console.log('Round RNG:', roundBalance.value.uiAmountString);

    console.log('\n=== Mining Test PASSED ===');
    return true;
  } catch (error) {
    console.error('\nDeploy failed:', error.message);
    if (error.logs) error.logs.slice(-8).forEach(log => console.log(' ', log));
    console.log('\n=== Mining Test FAILED ===');
    return false;
  }
}

testMiningDevnet().catch(console.error);
