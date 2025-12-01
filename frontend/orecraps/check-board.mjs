#!/usr/bin/env node
import { createSolanaRpc, address, getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

const PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

async function boardPDA() {
  const addressEncoder = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: PROGRAM_ID,
    seeds: [new TextEncoder().encode("board")],
  });
}

async function main() {
  const rpc = createSolanaRpc("http://127.0.0.1:8899");
  const [boardAddress] = await boardPDA();

  console.log("Board PDA:", boardAddress);

  const { value: boardAccount } = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();
  if (!boardAccount) {
    console.log("Board account does not exist - run initialize first");
    return;
  }

  const data = Buffer.from(boardAccount.data[0], "base64");
  console.log("Board data length:", data.length);

  // Parse board struct (from ore_api/src/state/board.rs)
  // struct Board {
  //   round: u64,        // 0-8
  //   start_slot: u64,   // 8-16
  //   end_slot: u64,     // 16-24
  //   ... more fields
  // }

  // Skip 8-byte discriminator
  const round = data.readBigUInt64LE(8);
  const startSlot = data.readBigUInt64LE(16);
  const endSlot = data.readBigUInt64LE(24);

  const currentSlot = await rpc.getSlot().send();

  console.log("\n=== Board State ===");
  console.log("Round:", round.toString());
  console.log("Start slot:", startSlot.toString());
  console.log("End slot:", endSlot.toString());
  console.log("Current slot:", currentSlot);
  console.log("\nEnd slot > Current?", Number(endSlot) > currentSlot);
  console.log("Is end_slot MAX?", endSlot.toString() === "18446744073709551615");

  if (Number(endSlot) < currentSlot && endSlot.toString() !== "18446744073709551615") {
    console.log("\n⚠️  Board end_slot has EXPIRED - this causes the entropy 'End at must be greater than current slot' error");
    console.log("   Need to call start_round to reset end_slot");
  }
}

main().catch(console.error);
