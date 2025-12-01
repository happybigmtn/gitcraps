#!/usr/bin/env node
/**
 * Updates Board account to use round 1 instead of round 0
 */

import * as fs from "fs";

const boardFile = process.argv[2] || "/home/r/Coding/ore/.localnet-accounts-initialized/board.json";
const boardData = JSON.parse(fs.readFileSync(boardFile, "utf-8"));
const data = Buffer.from(boardData.account.data[0], "base64");

console.log("Original data length:", data.length);
console.log("Original round_id:", data.readBigUInt64LE(8));

// Board structure:
// - discriminator: 0-8 (8 bytes)
// - round_id: 8-16 (u64)
// - slot: 16-24 (u64)

// Set round_id to 1
data.writeBigUInt64LE(1n, 8);

console.log("New round_id:", data.readBigUInt64LE(8));

boardData.account.data[0] = data.toString("base64");
fs.writeFileSync(boardFile, JSON.stringify(boardData, null, 2));
console.log("Saved to:", boardFile);
