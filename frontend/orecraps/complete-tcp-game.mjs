#!/usr/bin/env node
/**
 * Complete an active TCP (Three Card Poker) game by dealing and folding.
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SYSVAR_SLOT_HASHES_PUBKEY,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

const connection = new Connection(DEVNET_RPC, "confirmed");

// Load keypair
const keypairPath = "/home/r/.config/solana/id.json";
const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

console.log("Signer:", signer.publicKey.toBase58());

// PDAs
const [tcpGame] = PublicKey.findProgramAddressSync(
  [Buffer.from("threecard_game")],
  ORE_PROGRAM_ID
);
const [tcpPosition] = PublicKey.findProgramAddressSync(
  [Buffer.from("threecard_position"), signer.publicKey.toBuffer()],
  ORE_PROGRAM_ID
);

console.log("TCP Game PDA:", tcpGame.toBase58());
console.log("TCP Position PDA:", tcpPosition.toBase58());

// Check current state
const positionAccount = await connection.getAccountInfo(tcpPosition);
if (!positionAccount) {
  console.log("No TCP position found");
  process.exit(0);
}

const stateOffset = 56;
const anteOffset = 64;
const currentState = positionAccount.data[stateOffset];
const ante = positionAccount.data.readBigUInt64LE(anteOffset);

console.log("Current state:", currentState, ["Betting", "Dealt", "Decided", "Settled"][currentState] || "Unknown");
console.log("Ante:", ante.toString());

if (currentState === 0 && ante > 0n) {
  console.log("\n--- Step 1: DealThreeCard ---");

  // DealThreeCard = 59, data: round_id (8 bytes)
  const dealData = Buffer.alloc(9);
  dealData[0] = 59; // DealThreeCard
  dealData.writeBigUInt64LE(1n, 1); // round_id = 1

  const dealIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: tcpGame, isSigner: false, isWritable: true },
      { pubkey: tcpPosition, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_SLOT_HASHES_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: dealData,
  });

  const dealTx = new Transaction().add(dealIx);

  try {
    console.log("Simulating DealThreeCard...");
    const sim = await connection.simulateTransaction(dealTx, [signer]);
    if (sim.value.err) {
      console.log("Simulation failed:", JSON.stringify(sim.value.err));
      sim.value.logs?.forEach(log => console.log("  ", log));
      process.exit(1);
    }

    console.log("Sending DealThreeCard...");
    const sig = await sendAndConfirmTransaction(connection, dealTx, [signer]);
    console.log("DealThreeCard success:", sig);
  } catch (e) {
    console.log("DealThreeCard failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    process.exit(1);
  }

  // Check state after deal
  const afterDeal = await connection.getAccountInfo(tcpPosition);
  const stateAfterDeal = afterDeal.data[stateOffset];
  console.log("State after deal:", stateAfterDeal, ["Betting", "Dealt", "Decided", "Settled"][stateAfterDeal] || "Unknown");
}

// Refresh state
const positionAfterDeal = await connection.getAccountInfo(tcpPosition);
const stateAfterDeal = positionAfterDeal.data[stateOffset];

if (stateAfterDeal === 1) { // Dealt state
  console.log("\n--- Step 2: FoldThreeCard ---");

  // FoldThreeCard = 61, empty data
  const foldData = Buffer.alloc(1);
  foldData[0] = 61; // FoldThreeCard

  const foldIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: tcpGame, isSigner: false, isWritable: true },
      { pubkey: tcpPosition, isSigner: false, isWritable: true },
    ],
    data: foldData,
  });

  const foldTx = new Transaction().add(foldIx);

  try {
    console.log("Simulating FoldThreeCard...");
    const sim = await connection.simulateTransaction(foldTx, [signer]);
    if (sim.value.err) {
      console.log("Simulation failed:", JSON.stringify(sim.value.err));
      sim.value.logs?.forEach(log => console.log("  ", log));
      process.exit(1);
    }

    console.log("Sending FoldThreeCard...");
    const sig = await sendAndConfirmTransaction(connection, foldTx, [signer]);
    console.log("FoldThreeCard success:", sig);
  } catch (e) {
    console.log("FoldThreeCard failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    process.exit(1);
  }
}

// Final state check
const finalPosition = await connection.getAccountInfo(tcpPosition);
const finalState = finalPosition.data[stateOffset];
const finalAnte = finalPosition.data.readBigUInt64LE(anteOffset);
const pendingWinnings = finalPosition.data.readBigUInt64LE(104);

console.log("\n=== Final State ===");
console.log("State:", finalState, ["Betting", "Dealt", "Decided", "Settled"][finalState] || "Unknown");
console.log("Ante:", finalAnte.toString());
console.log("Pending winnings:", pendingWinnings.toString());

if (finalState === 3 && finalAnte > 0n) {
  console.log("\n⚠️  Position is settled but ante is still set.");
  console.log("ClaimThreeCardWinnings needs to be fixed to reset ante/play/pair_plus.");
}
