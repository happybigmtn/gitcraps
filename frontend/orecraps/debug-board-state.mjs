#!/usr/bin/env node
/**
 * Debug Board State
 *
 * Check the Board account to understand round timing for mining deploy.
 */

import {
  Connection,
  PublicKey,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], PROGRAM_ID);
}

function roundPDA(roundId) {
  const idBytes = Buffer.alloc(8);
  idBytes.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), idBytes], PROGRAM_ID);
}

async function main() {
  console.log("=== DEBUG BOARD STATE ===\n");

  const connection = new Connection("https://api.devnet.solana.com", "confirmed");

  // Get current slot
  const currentSlot = await connection.getSlot();
  console.log("Current Slot:", currentSlot);

  // Get board
  const [boardAddress] = boardPDA();
  const boardAccount = await connection.getAccountInfo(boardAddress);

  if (!boardAccount) {
    console.log("Board not found!");
    return;
  }

  const data = boardAccount.data;
  // Board layout (after 8-byte discriminator):
  // round_id: u64 (8 bytes) - offset 8
  // round_slots: u64 (8 bytes) - offset 16 (duration of rounds)
  // start_slot: u64 (8 bytes) - offset 24
  // end_slot: u64 (8 bytes) - offset 32

  // Board layout (after 8-byte discriminator):
  // round_id: u64 (8 bytes) - offset 8
  // start_slot: u64 (8 bytes) - offset 16
  // end_slot: u64 (8 bytes) - offset 24
  const roundId = data.readBigUInt64LE(8);
  const startSlot = data.readBigUInt64LE(16);
  const endSlot = data.readBigUInt64LE(24);

  console.log("\n--- Board State ---");
  console.log("Board Address:", boardAddress.toBase58());
  console.log("Round ID:", roundId.toString());
  console.log("Start Slot:", startSlot.toString());
  console.log("End Slot:", endSlot.toString());
  console.log("Round Duration:", Number(endSlot - startSlot), "slots");

  console.log("\n--- Timing Analysis ---");
  console.log("Current Slot:", currentSlot);
  console.log("Slots until round starts:", Number(startSlot) - currentSlot);
  console.log("Slots until round ends:", Number(endSlot) - currentSlot);

  // Check conditions
  const roundNotStarted = currentSlot < Number(startSlot);
  const roundExpired = currentSlot >= Number(endSlot);
  const roundActive = currentSlot >= Number(startSlot) && currentSlot < Number(endSlot);

  console.log("\n--- Conditions ---");
  console.log("Round not started yet:", roundNotStarted);
  console.log("Round expired:", roundExpired);
  console.log("Round active (can deploy):", roundActive);

  // Special case: end_slot == u64::MAX means round waiting for first deploy
  if (endSlot === BigInt("18446744073709551615")) {
    console.log("\n>>> SPECIAL CASE: end_slot = u64::MAX");
    console.log(">>> Round is waiting for first deploy to start");
  }

  // Get round account
  const [roundAddress] = roundPDA(roundId);
  const roundAccount = await connection.getAccountInfo(roundAddress);

  if (roundAccount) {
    console.log("\n--- Round Account ---");
    console.log("Round Address:", roundAddress.toBase58());

    const roundData = roundAccount.data;
    // Round layout:
    // discriminator: 8
    // id: 8
    // deployed: [u64; 36] = 288
    // slot_hash: [u8; 32] = 32
    // ...
    const id = roundData.readBigUInt64LE(8);
    const expiresAt = roundData.readBigUInt64LE(8 + 8 + 36*8 + 32 + 36*8); // 8 + 8 + 288 + 32 + 288 = 624
    console.log("Round ID (from account):", id.toString());
    console.log("Expires At:", expiresAt.toString());
    console.log("Slots until expires:", Number(expiresAt) - currentSlot);
  } else {
    console.log("\n>>> Round account not found!");
  }

  // Recommendation
  console.log("\n=== RECOMMENDATION ===");
  if (roundExpired || endSlot === BigInt("18446744073709551615")) {
    console.log("Need to start a new round before deploying.");
    console.log("Call StartRound instruction or wait for automatic round start.");
  } else if (!roundActive) {
    console.log("Wait for round to start before deploying.");
  } else {
    console.log("Round is active. Deploy should work.");
  }
}

main().catch(console.error);
