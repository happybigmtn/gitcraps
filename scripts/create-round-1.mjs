#!/usr/bin/env node
/**
 * Creates a Round 1 account JSON file with pre-set slot_hash for localnet testing.
 */

import * as fs from "fs";
import crypto from "crypto";
import pkg from "js-sha3";
const { keccak256 } = pkg;

// Read round-0 as template
const templateFile = "/home/r/Coding/ore/.localnet-accounts-initialized/round-0-with-entropy.json";
const outputFile = "/home/r/Coding/ore/.localnet-accounts-initialized/round-1-with-entropy.json";

const roundData = JSON.parse(fs.readFileSync(templateFile, "utf-8"));
const data = Buffer.from(roundData.account.data[0], "base64");

console.log("Original data length:", data.length);

// Round structure offsets:
// - discriminator: 0-8 (8 bytes)
// - id: 8-16 (u64)
// - deployed: 16-304 (36 * 8 = 288 bytes)
// - slot_hash: 304-336 (32 bytes)
// ...

const ID_OFFSET = 8;
const SLOT_HASH_OFFSET = 8 + 8 + 288; // = 304

// Set round id to 1
data.writeBigUInt64LE(1n, ID_OFFSET);
console.log("Round ID:", data.readBigUInt64LE(ID_OFFSET));

// Generate a random slot_hash
const slotHash = crypto.randomBytes(32);
console.log("Generated slot_hash:", slotHash.toString("hex"));

// Copy slot_hash into data
slotHash.copy(data, SLOT_HASH_OFFSET);

const BOARD_SIZE = 36n;
const U64_MAX = 0xFFFFFFFFFFFFFFFFn;

function calculateWinningSquare(slotHashBytes) {
  const hashHex = keccak256(slotHashBytes);
  const hashBytes = Buffer.from(hashHex, "hex");
  const sample = hashBytes.readBigUInt64LE(0);
  
  const maxValid = (U64_MAX / BOARD_SIZE) * BOARD_SIZE;
  
  if (sample < maxValid) {
    return Number(sample % BOARD_SIZE);
  } else {
    const hash2Hex = keccak256(hashBytes);
    const hash2Bytes = Buffer.from(hash2Hex, "hex");
    const sample2 = hash2Bytes.readBigUInt64LE(0);
    return Number(sample2 % BOARD_SIZE);
  }
}

function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2, die1 + die2];
}

const winningSquare = calculateWinningSquare(slotHash);
const [die1, die2, sum] = squareToDice(winningSquare);

console.log(`Winning square: ${winningSquare}`);
console.log(`Dice: ${die1} + ${die2} = ${sum}`);

// Update the output JSON
roundData.account.data[0] = data.toString("base64");

// Calculate round 1 PDA
import { PublicKey } from "@solana/web3.js";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function roundPDA(roundId) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("round"),
      Buffer.from(new BigUint64Array([BigInt(roundId)]).buffer),
    ],
    ORE_PROGRAM_ID
  );
}

const [round1Address] = roundPDA(1);
roundData.pubkey = round1Address.toBase58();
console.log("Round 1 PDA:", roundData.pubkey);

fs.writeFileSync(outputFile, JSON.stringify(roundData, null, 2));
console.log(`Saved to: ${outputFile}`);

// Save metadata
const meta = {
  slotHash: slotHash.toString("hex"),
  winningSquare,
  die1,
  die2,
  diceSum: sum,
};
fs.writeFileSync(outputFile.replace(".json", "-meta.json"), JSON.stringify(meta, null, 2));
console.log("Metadata saved");
