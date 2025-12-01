/**
 * Test Mining (Deploy) Functionality
 *
 * This script tests the Deploy instruction which allows users to "mine"
 * by deploying RNG tokens to dice outcome squares.
 */

import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createMintToInstruction, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import fs from 'fs';

const RPC = 'http://127.0.0.1:8899';
const connection = new Connection(RPC, 'confirmed');

// Program IDs
const ORE_PROGRAM_ID = new PublicKey('JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK');
const RNG_MINT = new PublicKey('RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump');
const ENTROPY_PROGRAM_ID = new PublicKey('EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1');

// Load admin keypair (has mint authority)
function loadAdminKeypair() {
  const keypairPath = '/home/r/.config/solana/id.json';
  const secretKey = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKey));
}

// PDA derivation functions
function boardPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('board')],
    ORE_PROGRAM_ID
  );
}

function roundPDA(roundId) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('round'), buffer],
    ORE_PROGRAM_ID
  );
}

function minerPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('miner'), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

function automationPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('automation'), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

function entropyVarPDA(board, index) {
  const indexBuffer = Buffer.alloc(8);
  indexBuffer.writeBigUInt64LE(BigInt(index));
  return PublicKey.findProgramAddressSync(
    [Buffer.from('entropy_var'), board.toBuffer(), indexBuffer],
    ORE_PROGRAM_ID
  );
}

// Convert squares array to bitmask
function squaresToMask(squares) {
  let mask = 0n;
  for (let i = 0; i < squares.length; i++) {
    if (squares[i]) {
      mask |= (1n << BigInt(i));
    }
  }
  return mask;
}

// Convert number to little-endian bytes
function toLeBytes(value, bytes) {
  const result = new Uint8Array(bytes);
  let v = BigInt(value);
  for (let i = 0; i < bytes; i++) {
    result[i] = Number(v & 0xFFn);
    v >>= 8n;
  }
  return result;
}

// Build Deploy instruction
async function createDeployInstruction(signer, authority, amount, roundId, squares, dicePrediction = 0) {
  const [automationAddress] = automationPDA(authority);
  const [boardAddress] = boardPDA();
  const [minerAddress] = minerPDA(authority);
  const [roundAddress] = roundPDA(roundId);
  const [entropyVarAddress] = entropyVarPDA(boardAddress, 0n);

  const signerRngAta = await getAssociatedTokenAddress(RNG_MINT, signer, false, TOKEN_PROGRAM_ID);
  const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundAddress, true, TOKEN_PROGRAM_ID);

  // Data format: [discriminator (1)] [amount (8)] [squares mask (8)] [dice_prediction (1)] [padding (7)]
  const mask = squaresToMask(squares);
  const data = new Uint8Array(25);
  data[0] = 6; // OreInstruction.Deploy = 6
  data.set(toLeBytes(amount, 8), 1);
  data.set(toLeBytes(mask, 8), 9);
  data[17] = dicePrediction;

  const keys = [
    // 7 ore accounts
    { pubkey: signer, isSigner: true, isWritable: true },
    { pubkey: authority, isSigner: false, isWritable: false },
    { pubkey: automationAddress, isSigner: false, isWritable: true },
    { pubkey: boardAddress, isSigner: false, isWritable: true },
    { pubkey: minerAddress, isSigner: false, isWritable: true },
    { pubkey: roundAddress, isSigner: false, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
    // 4 token accounts
    { pubkey: signerRngAta, isSigner: false, isWritable: true },
    { pubkey: roundRngAta, isSigner: false, isWritable: true },
    { pubkey: RNG_MINT, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    // 2 entropy accounts
    { pubkey: entropyVarAddress, isSigner: false, isWritable: true },
    { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return {
    programId: ORE_PROGRAM_ID,
    keys,
    data: Buffer.from(data),
  };
}

async function setupRngTokens(admin, amount) {
  console.log('\n--- Setting up RNG tokens ---');

  const adminRngAta = await getAssociatedTokenAddress(RNG_MINT, admin.publicKey);
  const amountBigInt = BigInt(amount);

  // Check if ATA exists
  try {
    const ataInfo = await connection.getAccountInfo(adminRngAta);
    if (!ataInfo) {
      console.log('Creating admin RNG ATA...');
      const tx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          admin.publicKey,
          adminRngAta,
          admin.publicKey,
          RNG_MINT
        )
      );
      await sendAndConfirmTransaction(connection, tx, [admin]);
    }

    // Mint RNG tokens
    console.log(`Minting ${Number(amountBigInt) / 1e9} RNG to admin...`);
    const mintTx = new Transaction().add(
      createMintToInstruction(
        RNG_MINT,
        adminRngAta,
        admin.publicKey,
        amountBigInt
      )
    );
    await sendAndConfirmTransaction(connection, mintTx, [admin]);

    const balance = await connection.getTokenAccountBalance(adminRngAta);
    console.log('Admin RNG balance:', balance.value.uiAmountString);
  } catch (error) {
    console.error('Error setting up RNG tokens:', error.message);
    throw error;
  }
}

async function testDeploy() {
  console.log('=== Testing Mining (Deploy) Instruction ===\n');

  const admin = loadAdminKeypair();
  console.log('Admin pubkey:', admin.publicKey.toString());

  // Check board exists
  const [boardAddress] = boardPDA();
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) {
    console.error('Board not initialized! Run: curl -X POST http://localhost:3000/api/initialize');
    process.exit(1);
  }

  // Parse roundId from board (it's at offset 8, 8 bytes little-endian)
  const roundId = boardInfo.data.readBigUInt64LE(8);
  console.log('Current round ID:', roundId.toString());

  // Setup RNG tokens (mint 10 RNG)
  await setupRngTokens(admin, 10_000_000_000n);

  // Check if round RNG ATA needs to be created
  const [roundAddress] = roundPDA(roundId);
  const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundAddress, true);
  const roundRngAtaInfo = await connection.getAccountInfo(roundRngAta);

  if (!roundRngAtaInfo) {
    console.log('\nCreating round RNG ATA...');
    const createAtaTx = new Transaction().add(
      createAssociatedTokenAccountInstruction(
        admin.publicKey,
        roundRngAta,
        roundAddress,
        RNG_MINT
      )
    );
    await sendAndConfirmTransaction(connection, createAtaTx, [admin]);
    console.log('Round RNG ATA created:', roundRngAta.toString());
  }

  // Select some squares (first 6 squares = dice outcomes 1-1 through 1-6)
  const selectedSquares = new Array(36).fill(false);
  selectedSquares[0] = true;  // (1,1) = 2
  selectedSquares[1] = true;  // (1,2) = 3
  selectedSquares[2] = true;  // (1,3) = 4
  selectedSquares[6] = true;  // (2,1) = 3
  selectedSquares[7] = true;  // (2,2) = 4
  selectedSquares[8] = true;  // (2,3) = 5

  // Deploy 1 RNG across selected squares
  const deployAmount = 1_000_000_000n; // 1 RNG

  console.log('\n--- Testing Deploy instruction ---');
  console.log('Selected squares:', selectedSquares.filter(Boolean).length);
  console.log('Deploy amount:', Number(deployAmount) / 1e9, 'RNG');

  try {
    const deployIx = await createDeployInstruction(
      admin.publicKey,
      admin.publicKey,
      deployAmount,
      roundId,
      selectedSquares
    );

    const tx = new Transaction().add(deployIx);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = admin.publicKey;

    console.log('Sending Deploy transaction...');
    const signature = await sendAndConfirmTransaction(connection, tx, [admin]);
    console.log('Deploy transaction succeeded!');
    console.log('Signature:', signature);

    // Check updated balances
    const adminRngAtaPost = await getAssociatedTokenAddress(RNG_MINT, admin.publicKey);
    const [roundAddressPost] = roundPDA(roundId);
    const roundRngAtaPost = await getAssociatedTokenAddress(RNG_MINT, roundAddressPost, true);
    const adminBalance = await connection.getTokenAccountBalance(adminRngAtaPost);
    const roundBalance = await connection.getTokenAccountBalance(roundRngAtaPost);

    console.log('\n--- Post-Deploy Balances ---');
    console.log('Admin RNG:', adminBalance.value.uiAmountString);
    console.log('Round RNG:', roundBalance.value.uiAmountString);

    console.log('\n=== Mining Test PASSED ===');
    return true;
  } catch (error) {
    console.error('\nDeploy failed:', error.message);
    if (error.logs) {
      console.log('\nTransaction logs:');
      error.logs.forEach(log => console.log(' ', log));
    }
    console.log('\n=== Mining Test FAILED ===');
    return false;
  }
}

testDeploy().catch(console.error);
