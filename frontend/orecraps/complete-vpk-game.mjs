#!/usr/bin/env node
/**
 * Complete an active VPK (Video Poker) game by dealing and drawing.
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
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
const [vpkGame] = PublicKey.findProgramAddressSync(
  [Buffer.from("video_poker_game")],
  ORE_PROGRAM_ID
);
const [vpkPosition] = PublicKey.findProgramAddressSync(
  [Buffer.from("video_poker_position"), signer.publicKey.toBuffer()],
  ORE_PROGRAM_ID
);

// Round PDA - need to find a valid round with slot_hash
// For now, use round 0
const [roundPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("round"), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])], // round 0
  ORE_PROGRAM_ID
);

console.log("VPK Game PDA:", vpkGame.toBase58());
console.log("VPK Position PDA:", vpkPosition.toBase58());
console.log("Round PDA:", roundPda.toBase58());

// Check current state
const positionAccount = await connection.getAccountInfo(vpkPosition);
if (!positionAccount) {
  console.log("No VPK position found");
  process.exit(0);
}

const stateOffset = 56;
const currentState = positionAccount.data[stateOffset];
const stateNames = ["None", "Betting", "Dealt", "Held", "Settled"];
console.log("Current state:", currentState, `(${stateNames[currentState] || "Unknown"})`);

if (currentState === 1) { // Betting state - need to deal
  console.log("\n--- Step 1: DealVideoPoker ---");

  // DealVideoPoker = 65, no data
  const dealData = Buffer.alloc(1);
  dealData[0] = 65; // DealVideoPoker

  const dealIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: vpkPosition, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: false },
    ],
    data: dealData,
  });

  const dealTx = new Transaction().add(dealIx);

  try {
    console.log("Simulating DealVideoPoker...");
    const sim = await connection.simulateTransaction(dealTx, [signer]);
    if (sim.value.err) {
      console.log("Simulation failed:", JSON.stringify(sim.value.err));
      sim.value.logs?.forEach(log => console.log("  ", log));
      process.exit(1);
    }

    console.log("Sending DealVideoPoker...");
    const sig = await sendAndConfirmTransaction(connection, dealTx, [signer]);
    console.log("DealVideoPoker success:", sig);
  } catch (e) {
    console.log("DealVideoPoker failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    process.exit(1);
  }
}

// Refresh state
const positionAfterDeal = await connection.getAccountInfo(vpkPosition);
const stateAfterDeal = positionAfterDeal.data[stateOffset];
console.log("State after deal:", stateAfterDeal, `(${stateNames[stateAfterDeal] || "Unknown"})`);

if (stateAfterDeal === 2) { // Dealt state - need to hold/draw
  console.log("\n--- Step 2: HoldAndDraw ---");

  // HoldAndDraw = 66, data: held_mask (1 byte) + 7 bytes padding = 8 bytes total
  const holdData = Buffer.alloc(9);
  holdData[0] = 66; // HoldAndDraw
  holdData[1] = 0b11111; // Hold all 5 cards
  // bytes 2-8 are padding (already 0)

  const holdIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: vpkGame, isSigner: false, isWritable: true },
      { pubkey: vpkPosition, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: false },
    ],
    data: holdData,
  });

  const holdTx = new Transaction().add(holdIx);

  try {
    console.log("Simulating HoldAndDraw...");
    const sim = await connection.simulateTransaction(holdTx, [signer]);
    if (sim.value.err) {
      console.log("Simulation failed:", JSON.stringify(sim.value.err));
      sim.value.logs?.forEach(log => console.log("  ", log));
      process.exit(1);
    }

    console.log("Sending HoldAndDraw...");
    const sig = await sendAndConfirmTransaction(connection, holdTx, [signer]);
    console.log("HoldAndDraw success:", sig);
  } catch (e) {
    console.log("HoldAndDraw failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    process.exit(1);
  }
}

// Final state check
const finalPosition = await connection.getAccountInfo(vpkPosition);
const finalState = finalPosition.data[stateOffset];
const pendingWinnings = finalPosition.data.readBigUInt64LE(88);

console.log("\n=== Final State ===");
console.log("State:", finalState, `(${stateNames[finalState] || "Unknown"})`);
console.log("Pending winnings:", pendingWinnings.toString());

if (finalState === 4) {
  console.log("\nGame completed! Position is now in Settled state.");
  console.log("The next PlaceVideoPokerBet should reset the position.");
}
