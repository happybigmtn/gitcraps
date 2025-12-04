#!/usr/bin/env node
/**
 * Test Mining Deploy on Devnet
 * Tests the Deploy instruction directly via CLI
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const RNG_MINT = new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const ENTROPY_PROGRAM_ID = new PublicKey("EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function toLeBytes(value, size) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  if (size === 8) {
    view.setBigUint64(0, BigInt(value), true);
  } else if (size === 4) {
    view.setUint32(0, Number(value), true);
  }
  return new Uint8Array(buffer);
}

// Convert selected squares to bitmask
function squaresToMask(squares) {
  let mask = 0n;
  for (let i = 0; i < 36 && i < squares.length; i++) {
    if (squares[i]) {
      mask |= (1n << BigInt(i));
    }
  }
  return mask;
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("=".repeat(60));
  console.log("DEVNET MINING DEPLOY TEST");
  console.log("=".repeat(60));
  console.log("Signer:", signer.publicKey.toBase58());

  // Get PDAs
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const [minerPda] = findPDA([Buffer.from("miner"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);
  const [automationPda] = findPDA([Buffer.from("automation"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);

  console.log("Board PDA:", boardPda.toBase58());
  console.log("Miner PDA:", minerPda.toBase58());

  // Get board to find current round
  const boardAccount = await connection.getAccountInfo(boardPda);
  if (!boardAccount) {
    console.log("ERROR: Board not initialized!");
    return;
  }

  const roundId = boardAccount.data.readBigUInt64LE(8);
  const startSlot = boardAccount.data.readBigUInt64LE(16);
  const endSlot = boardAccount.data.readBigUInt64LE(24);

  console.log("Current round ID:", roundId.toString());
  console.log("Start slot:", startSlot.toString());
  console.log("End slot:", endSlot.toString());

  const currentSlot = await connection.getSlot();
  console.log("Current slot:", currentSlot);

  if (currentSlot < startSlot || currentSlot >= endSlot) {
    console.log("ERROR: Round not active! Run start-mining-round.mjs first");
    return;
  }
  console.log("Round is ACTIVE!");

  // Get round PDA
  const roundIdBytes = Buffer.alloc(8);
  roundIdBytes.writeBigUInt64LE(roundId);
  const [roundPda] = findPDA([Buffer.from("round"), roundIdBytes], ORE_PROGRAM_ID);
  console.log("Round PDA:", roundPda.toBase58());

  // Entropy var PDA
  const entropyIndexBytes = Buffer.alloc(8);
  entropyIndexBytes.writeBigUInt64LE(0n);
  const [entropyVarPda] = findPDA(
    [Buffer.from("var"), boardPda.toBuffer(), entropyIndexBytes],
    ENTROPY_PROGRAM_ID
  );
  console.log("Entropy Var PDA:", entropyVarPda.toBase58());

  // Token accounts
  const signerRngAta = await getAssociatedTokenAddress(RNG_MINT, signer.publicKey);
  const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundPda, true);

  console.log("Signer RNG ATA:", signerRngAta.toBase58());
  console.log("Round RNG ATA:", roundRngAta.toBase58());

  // Check RNG balance
  try {
    const balanceResp = await connection.getTokenAccountBalance(signerRngAta);
    console.log("RNG balance:", balanceResp.value.uiAmount);
    if (balanceResp.value.uiAmount < 1) {
      console.log("WARNING: Low RNG balance!");
    }
  } catch (e) {
    console.log("No RNG balance - need tokens first");
    return;
  }

  // Build Deploy instruction
  // Select squares for sum 7: (1,6), (2,5), (3,4), (4,3), (5,2), (6,1)
  const squares = new Array(36).fill(false);
  // Square index = (die1-1)*6 + (die2-1)
  squares[0*6 + 5] = true; // 1-6
  squares[1*6 + 4] = true; // 2-5
  squares[2*6 + 3] = true; // 3-4
  squares[3*6 + 2] = true; // 4-3
  squares[4*6 + 1] = true; // 5-2
  squares[5*6 + 0] = true; // 6-1

  const selectedCount = squares.filter(Boolean).length;
  console.log(`\nSelected ${selectedCount} squares (sum=7)`);

  const amountPerSquare = 1_000_000_000n; // 1 RNG per square
  const totalAmount = amountPerSquare * BigInt(selectedCount);
  console.log("Amount per square:", (Number(amountPerSquare) / 1e9).toFixed(2), "RNG");
  console.log("Total deploy amount:", (Number(totalAmount) / 1e9).toFixed(2), "RNG");

  const mask = squaresToMask(squares);
  console.log("Square mask:", mask.toString(16));

  // Deploy instruction data
  // Format: [discriminator (1)] [amount (8)] [squares mask (8)] [dice_prediction (1)] [padding (7)]
  // NOTE: amount is PER SQUARE, not total!
  const data = new Uint8Array(25);
  data[0] = 6; // Deploy discriminator
  data.set(toLeBytes(amountPerSquare, 8), 1); // Per-square amount, NOT total!
  data.set(toLeBytes(mask, 8), 9);
  data[17] = 0; // dice_prediction = 0 (safe mode)
  // bytes 18-24 are padding (already zero-initialized)

  const deployIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      // Ore accounts (7)
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: signer.publicKey, isSigner: false, isWritable: true }, // authority = signer
      { pubkey: automationPda, isSigner: false, isWritable: true },
      { pubkey: boardPda, isSigner: false, isWritable: true },
      { pubkey: minerPda, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      // Token accounts (4)
      { pubkey: signerRngAta, isSigner: false, isWritable: true },
      { pubkey: roundRngAta, isSigner: false, isWritable: true },
      { pubkey: RNG_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      // Entropy accounts (2)
      { pubkey: entropyVarPda, isSigner: false, isWritable: true },
      { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });

  const tx = new Transaction().add(deployIx);
  tx.feePayer = signer.publicKey;

  console.log("\n--- Simulating Deploy ---");
  try {
    const simulation = await connection.simulateTransaction(tx, [signer]);
    if (simulation.value.err) {
      console.log("Simulation FAILED:", JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log("  ", log));
      return;
    }
    console.log("Simulation PASSED!");
    simulation.value.logs?.slice(-5).forEach(log => console.log("  ", log));
  } catch (e) {
    console.log("Simulation error:", e.message);
    return;
  }

  console.log("\n--- Sending Deploy Transaction ---");
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log("SUCCESS! Signature:", sig);
  } catch (e) {
    console.log("Deploy FAILED:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    return;
  }

  // Verify deployment
  console.log("\n--- Verifying Deployment ---");
  const roundAccount = await connection.getAccountInfo(roundPda);
  if (roundAccount) {
    // Round struct: deployed array starts after header
    // Skip discriminator(8) + winning_square(8) + expires_at(8) = 24 bytes
    // Then 36 x u64 deployed array
    const deployedOffset = 24;
    for (let i = 0; i < 36; i++) {
      if (squares[i]) {
        const deployed = roundAccount.data.readBigUInt64LE(deployedOffset + i * 8);
        console.log(`  Square ${i}: ${(Number(deployed) / 1e9).toFixed(4)} RNG deployed`);
      }
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("MINING DEPLOY TEST COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
