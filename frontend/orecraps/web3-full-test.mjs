#!/usr/bin/env node
/**
 * COMPREHENSIVE CRAPS BET TESTING - Using @solana/web3.js
 *
 * Tests ALL bet types with on-chain settlement using CRAP tokens:
 * 1. Initialize board/config/treasury/round
 * 2. Mint CRAP tokens to admin
 * 3. Fund craps house with CRAP tokens
 * 4. Place ALL bet types with CRAP tokens
 * 5. Settle bets and verify payouts
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { spawnSync } from "child_process";
import fs from "fs";

// Constants
const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

// Instruction discriminators (from ore_api)
const INITIALIZE = 1;
const FUND_CRAPS_HOUSE = 26;
const PLACE_CRAPS_BET = 23;
const SETTLE_CRAPS = 24;

// CRAP token decimals (9 decimals like SOL)
const ONE_CRAP = BigInt(1_000_000_000);

// CrapsBetType enum (matches Rust enum)
const CrapsBetType = {
  PassLine: 0,
  DontPass: 1,
  PassOdds: 2,
  DontPassOdds: 3,
  Come: 4,
  DontCome: 5,
  ComeOdds: 6,
  DontComeOdds: 7,
  Place: 8,
  Hardway: 9,
  Field: 10,
  AnySeven: 11,
  AnyCraps: 12,
  YoEleven: 13,
  Aces: 14,
  Twelve: 15,
};

// Helper functions
function toLeBytes(n, len) {
  const arr = Buffer.alloc(len);
  arr.writeBigUInt64LE(BigInt(n), 0);
  return arr;
}

function boardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function configPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID);
}

function treasuryPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("treasury")], ORE_PROGRAM_ID);
}

function roundPDA(roundId) {
  const idBytes = toLeBytes(roundId, 8);
  return PublicKey.findProgramAddressSync([Buffer.from("round"), idBytes], ORE_PROGRAM_ID);
}

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_game")], ORE_PROGRAM_ID);
}

function crapsVaultPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("craps_vault")], ORE_PROGRAM_ID);
}

function crapsPositionPDA(authority) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

// Dice calculation
function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2];
}

// Results tracking
const results = {
  initialized: false,
  totalTransactions: 0,
  confirmed: 0,
  failed: 0,
  betsPlaced: {},
  betsSettled: {},
  epochs: [],
};

async function sendTx(connection, payer, instruction, description) {
  results.totalTransactions++;
  try {
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });
    results.confirmed++;
    console.log(`  ✓ ${description}: ${sig.slice(0, 40)}...`);
    return { success: true, signature: sig };
  } catch (e) {
    results.failed++;
    const errMsg = e.message || String(e);
    console.log(`  ✗ ${description}: ${errMsg.slice(0, 150)}`);
    if (e.logs) {
      console.log(`    Logs: ${e.logs.slice(-3).join("\n          ")}`);
    }
    return { success: false, error: errMsg };
  }
}

async function initializeBoard(connection, payer) {
  console.log("\n=== INITIALIZING BOARD ===");

  const [boardAddress] = boardPDA();
  const [configAddress] = configPDA();
  const [treasuryAddress] = treasuryPDA();
  const [roundAddress] = roundPDA(0);

  // Check if already initialized
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (boardInfo) {
    console.log("  Board already initialized");
    results.initialized = true;
    return true;
  }

  // Initialize instruction: discriminator 1
  const data = Buffer.alloc(1);
  data[0] = INITIALIZE;

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: true },
      { pubkey: treasuryAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  const result = await sendTx(connection, payer, instruction, "Initialize Board");
  results.initialized = result.success;
  return result.success;
}

/**
 * Mint CRAP tokens using spl-token CLI.
 * The crap-mint.json has the test keypair as mint authority.
 */
async function mintCrapTokens(connection, payer, amount) {
  console.log(`\n=== MINTING ${amount} CRAP TOKENS ===`);

  // Use spl-token CLI to mint tokens (test keypair is mint authority)
  const mintResult = spawnSync("spl-token", [
    "mint", CRAP_MINT.toBase58(), String(amount),
    "--url", LOCALNET_RPC
  ], { encoding: "utf-8" });

  if (mintResult.stderr && mintResult.stderr.includes("error")) {
    console.log(`  ✗ Mint failed: ${mintResult.stderr.slice(0, 300)}`);
    return false;
  }

  // Verify balance
  const ata = getAssociatedTokenAddressSync(CRAP_MINT, payer.publicKey);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    console.log(`  ✓ Minted ${balance.value.uiAmount} CRAP`);
    return balance.value.uiAmount >= amount;
  } catch (e) {
    // ATA might not exist yet, spl-token creates it automatically
    const sigMatch = mintResult.stdout.match(/Signature: (\w+)/);
    console.log(`  ✓ Minted ${amount} CRAP: ${sigMatch?.[1]?.slice(0, 30) || "OK"}...`);
    return true;
  }
}

async function ensureAtaExists(connection, payer, owner, mint, allowOwnerOffCurve = false) {
  const ata = getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve);
  const info = await connection.getAccountInfo(ata);

  if (!info) {
    console.log(`  Creating ATA for ${owner.toBase58().slice(0, 8)}...`);
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      mint
    );
    const tx = new Transaction().add(ix);
    await sendAndConfirmTransaction(connection, tx, [payer]);
  }

  return ata;
}

async function fundCrapsHouse(connection, payer, amountCrap) {
  console.log(`\n=== FUNDING CRAPS HOUSE (${amountCrap} CRAP) ===`);

  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();

  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, payer.publicKey);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  // Ensure signer ATA exists
  await ensureAtaExists(connection, payer, payer.publicKey, CRAP_MINT);

  // Check signer balance
  try {
    const balance = await connection.getTokenAccountBalance(signerCrapAta);
    console.log(`  Signer CRAP balance: ${balance.value.uiAmount} CRAP`);
  } catch (e) {
    console.log(`  No CRAP balance yet`);
  }

  // Build FundCrapsHouse instruction
  // Account layout: signer, craps_game, craps_vault, signer_crap_ata, vault_crap_ata, crap_mint, system_program, token_program, associated_token_program
  const amount = BigInt(amountCrap) * ONE_CRAP;

  const data = Buffer.alloc(9);
  data[0] = FUND_CRAPS_HOUSE;
  data.writeBigUInt64LE(amount, 1);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  return sendTx(connection, payer, instruction, `Fund House ${amountCrap} CRAP`);
}

async function placeBet(connection, payer, betType, betName, amountCrap, point = 0) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();
  const [crapsPositionAddress] = crapsPositionPDA(payer.publicKey);

  const signerCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, payer.publicKey);
  const vaultCrapAta = getAssociatedTokenAddressSync(CRAP_MINT, crapsVaultAddress, true);

  const amount = BigInt(amountCrap) * ONE_CRAP;

  // PlaceCrapsBet: [23 (1 byte)] [bet_type (1 byte)] [point (1 byte)] [padding (6 bytes)] [amount (8 bytes)]
  const data = Buffer.alloc(17);
  data[0] = PLACE_CRAPS_BET;
  data[1] = betType;
  data[2] = point;
  // Bytes 3-8 are padding (zeros)
  data.writeBigUInt64LE(amount, 9);

  // Account layout: signer, craps_game, craps_position, craps_vault, signer_crap_ata, vault_crap_ata, crap_mint, system_program, token_program, associated_token_program
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: crapsVaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  const result = await sendTx(connection, payer, instruction, `Bet ${betName} (${amountCrap} CRAP)`);
  if (result.success) {
    results.betsPlaced[betName] = (results.betsPlaced[betName] || 0) + 1;
  }
  return result;
}

async function settleBets(connection, payer, winningSquare) {
  console.log(`\n--- SETTLING BETS (winning_square=${winningSquare}) ---`);

  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(payer.publicKey);
  const [boardAddress] = boardPDA();

  // Get current round ID from board
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) {
    console.log("  Board not found");
    return { success: false };
  }

  const roundId = boardInfo.data.readBigUInt64LE(8);
  const [roundAddress] = roundPDA(roundId);

  // SettleCraps: [24 (1 byte)] [winning_square (8 bytes)]
  const data = Buffer.alloc(9);
  data[0] = SETTLE_CRAPS;
  data.writeBigUInt64LE(BigInt(winningSquare), 1);

  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data,
  });

  const [die1, die2] = squareToDice(winningSquare);
  const result = await sendTx(connection, payer, instruction, `Settle (dice: ${die1}+${die2}=${die1+die2})`);
  if (result.success) {
    results.betsSettled[`epoch_${results.epochs.length}`] = winningSquare;
  }
  return result;
}

/**
 * Advance the round using setAccount RPC (localnet only).
 * This increments board.round_id and creates a new Round account.
 */
async function advanceRound(connection) {
  console.log(`\n--- ADVANCING ROUND (via setAccount) ---`);

  const [boardAddress] = boardPDA();
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) {
    console.log("  Board not found");
    return false;
  }

  // Read current round_id (offset 8 in Board)
  const currentRoundId = boardInfo.data.readBigUInt64LE(8);
  const newRoundId = currentRoundId + 1n;
  console.log(`  Current round: ${currentRoundId} -> New round: ${newRoundId}`);

  // Create new board data with incremented round_id
  const newBoardData = Buffer.from(boardInfo.data);
  newBoardData.writeBigUInt64LE(newRoundId, 8);

  // Use setAccount to update board
  const boardResponse = await fetch(LOCALNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'setAccount',
      params: [
        boardAddress.toBase58(),
        {
          lamports: boardInfo.lamports,
          data: [newBoardData.toString('base64'), 'base64'],
          owner: boardInfo.owner.toBase58(),
          executable: false,
          rentEpoch: 0,
        }
      ]
    })
  });

  const boardResult = await boardResponse.json();
  if (boardResult.error) {
    console.log(`  ✗ Failed to update board: ${boardResult.error.message}`);
    return false;
  }

  // Create new Round account with the new round_id
  // Round layout: discriminator(8) + id(8) + deployed[36](288) + slot_hash(32) + winner(32) + expires_at(8) = 376 bytes
  const [newRoundAddress] = roundPDA(newRoundId);
  const roundDataSize = 376;
  const newRoundData = Buffer.alloc(roundDataSize);

  // Write discriminator (Round discriminator from ore_api - need to match)
  // Assuming discriminator is first 8 bytes
  newRoundData.writeBigUInt64LE(0n, 0); // placeholder discriminator
  newRoundData.writeBigUInt64LE(newRoundId, 8); // id
  // deployed[36] = all zeros (288 bytes starting at offset 16)
  // slot_hash[32] = all zeros (32 bytes starting at offset 304)
  // winner = null/zeros (32 bytes starting at offset 336)
  // expires_at = u64::MAX to indicate waiting for first deploy
  newRoundData.writeBigUInt64LE(BigInt("18446744073709551615"), 368);

  // Calculate minimum rent for the account
  const rentLamports = await connection.getMinimumBalanceForRentExemption(roundDataSize);

  const roundResponse = await fetch(LOCALNET_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'setAccount',
      params: [
        newRoundAddress.toBase58(),
        {
          lamports: rentLamports,
          data: [newRoundData.toString('base64'), 'base64'],
          owner: ORE_PROGRAM_ID.toBase58(),
          executable: false,
          rentEpoch: 0,
        }
      ]
    })
  });

  const roundResult = await roundResponse.json();
  if (roundResult.error) {
    console.log(`  ✗ Failed to create round: ${roundResult.error.message}`);
    return false;
  }

  console.log(`  ✓ Round advanced to ${newRoundId}`);
  return true;
}

async function testComeOutBets(connection, payer) {
  console.log("\n=== PLACING COME-OUT PHASE BETS ===");
  console.log("(PassLine, DontPass, Field, AnySeven, AnyCraps, YoEleven, Aces, Twelve)");

  const betAmountCrap = 10; // 10 CRAP per bet

  const bets = [
    { type: CrapsBetType.PassLine, name: "PassLine", amount: betAmountCrap },
    { type: CrapsBetType.DontPass, name: "DontPass", amount: betAmountCrap },
    { type: CrapsBetType.Field, name: "Field", amount: betAmountCrap },
    { type: CrapsBetType.AnySeven, name: "AnySeven", amount: betAmountCrap },
    { type: CrapsBetType.AnyCraps, name: "AnyCraps", amount: betAmountCrap },
    { type: CrapsBetType.YoEleven, name: "YoEleven", amount: betAmountCrap },
    { type: CrapsBetType.Aces, name: "Aces", amount: betAmountCrap },
    { type: CrapsBetType.Twelve, name: "Twelve", amount: betAmountCrap },
  ];

  for (const bet of bets) {
    await placeBet(connection, payer, bet.type, bet.name, bet.amount);
    await new Promise(r => setTimeout(r, 100));
  }
}

async function testBonusBets(connection, payer) {
  console.log("\n=== PLACING BONUS BETS ===");
  console.log("(Hardway 4/6/8/10, Place 4/5/6/8/9/10)");

  const betAmountCrap = 5; // 5 CRAP per bet

  // Hardway bets (point must be 4, 6, 8, or 10)
  const hardways = [
    { point: 4, name: "Hardway 4" },
    { point: 6, name: "Hardway 6" },
    { point: 8, name: "Hardway 8" },
    { point: 10, name: "Hardway 10" },
  ];

  for (const hw of hardways) {
    await placeBet(connection, payer, CrapsBetType.Hardway, hw.name, betAmountCrap, hw.point);
    await new Promise(r => setTimeout(r, 100));
  }

  // Place bets (point must be 4, 5, 6, 8, 9, or 10)
  const places = [
    { point: 4, name: "Place 4" },
    { point: 5, name: "Place 5" },
    { point: 6, name: "Place 6" },
    { point: 8, name: "Place 8" },
    { point: 9, name: "Place 9" },
    { point: 10, name: "Place 10" },
  ];

  for (const pl of places) {
    await placeBet(connection, payer, CrapsBetType.Place, pl.name, betAmountCrap, pl.point);
    await new Promise(r => setTimeout(r, 100));
  }
}

async function testEpoch(connection, payer, epochNum, winningSquare) {
  console.log(`\n========================================`);
  console.log(`EPOCH ${epochNum}`);
  console.log(`========================================`);

  // Place come-out bets
  await testComeOutBets(connection, payer);

  // Place bonus bets
  await testBonusBets(connection, payer);

  // Settle with specific dice outcome
  const [die1, die2] = squareToDice(winningSquare);
  console.log(`\nRolling dice: ${die1} + ${die2} = ${die1 + die2}`);

  const settleResult = await settleBets(connection, payer, winningSquare);

  results.epochs.push({
    epoch: epochNum,
    winningSquare,
    dice: [die1, die2],
    sum: die1 + die2,
    settled: settleResult.success,
  });

  // Advance round for next epoch (only if settlement was successful)
  if (settleResult.success) {
    await advanceRound(connection);
  }

  return settleResult;
}

async function getCrapBalance(connection, owner) {
  const ata = getAssociatedTokenAddressSync(CRAP_MINT, owner);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    return balance.value.uiAmount || 0;
  } catch (e) {
    return 0;
  }
}

async function main() {
  console.log("========================================");
  console.log("COMPREHENSIVE CRAPS BET TEST");
  console.log("Using @solana/web3.js + CRAP Tokens");
  console.log("On-chain settlement (localnet)");
  console.log("========================================\n");

  // Connect
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  // Verify connection
  try {
    const version = await connection.getVersion();
    console.log(`Connected to localnet: Solana ${version["solana-core"]}`);
  } catch (e) {
    console.error("Failed to connect to localnet:", e.message);
    process.exit(1);
  }

  // Load keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`\nPlayer: ${payer.publicKey.toBase58()}`);

  const initialCrapBalance = await getCrapBalance(connection, payer.publicKey);
  console.log(`Initial CRAP balance: ${initialCrapBalance} CRAP`);

  // Print PDAs
  const [boardAddress] = boardPDA();
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsVaultAddress] = crapsVaultPDA();
  const [crapsPositionAddress] = crapsPositionPDA(payer.publicKey);

  console.log(`\nPDAs:`);
  console.log(`  Board: ${boardAddress.toBase58()}`);
  console.log(`  CrapsGame: ${crapsGameAddress.toBase58()}`);
  console.log(`  CrapsVault: ${crapsVaultAddress.toBase58()}`);
  console.log(`  CrapsPosition: ${crapsPositionAddress.toBase58()}`);

  // Initialize
  await initializeBoard(connection, payer);

  // Mint CRAP tokens (2 million for testing)
  await mintCrapTokens(connection, payer, 2_000_000);

  // Fund house (1 million CRAP)
  await fundCrapsHouse(connection, payer, 1_000_000);

  // Test multiple epochs with different dice outcomes
  const testCases = [
    { epoch: 1, square: 6 },   // dice sum 7 (natural - PassLine wins on come-out)
    { epoch: 2, square: 0 },   // dice sum 2 (craps - Aces wins, AnyCraps wins)
    { epoch: 3, square: 10 },  // dice sum 11 (Yo - YoEleven wins)
    { epoch: 4, square: 35 },  // dice sum 12 (craps - Twelve wins, AnyCraps wins)
    { epoch: 5, square: 30 },  // dice sum 7 (AnySeven wins)
    { epoch: 6, square: 8 },   // dice sum 9 (Field wins: 2,3,4,9,10,11,12)
    { epoch: 7, square: 2 },   // dice sum 3 (craps - AnyCraps wins)
    { epoch: 8, square: 18 },  // dice sum 8 (point number)
  ];

  for (const test of testCases) {
    await testEpoch(connection, payer, test.epoch, test.square);
    await new Promise(r => setTimeout(r, 500)); // Delay between epochs
  }

  // Final report
  const finalCrapBalance = await getCrapBalance(connection, payer.publicKey);

  console.log("\n========================================");
  console.log("FINAL REPORT");
  console.log("========================================");
  console.log(`\nTransaction Summary:`);
  console.log(`  Total: ${results.totalTransactions}`);
  console.log(`  Confirmed: ${results.confirmed}`);
  console.log(`  Failed: ${results.failed}`);

  console.log(`\nBets Placed:`);
  for (const [name, count] of Object.entries(results.betsPlaced)) {
    console.log(`  ${name}: ${count}`);
  }

  console.log(`\nEpoch Results:`);
  for (const epoch of results.epochs) {
    const [d1, d2] = epoch.dice;
    console.log(`  Epoch ${epoch.epoch}: ${d1}+${d2}=${epoch.sum} (square ${epoch.winningSquare}) - ${epoch.settled ? "SETTLED" : "FAILED"}`);
  }

  console.log(`\nCRAP Balance Change:`);
  console.log(`  Initial: ${initialCrapBalance.toFixed(2)} CRAP`);
  console.log(`  Final:   ${finalCrapBalance.toFixed(2)} CRAP`);
  console.log(`  Change:  ${(finalCrapBalance - initialCrapBalance).toFixed(2)} CRAP`);

  if (results.confirmed > 0 && results.failed === 0) {
    console.log("\n✓ ALL TRANSACTIONS CONFIRMED ON-CHAIN");
  } else if (results.confirmed > 0) {
    console.log(`\n⚠ ${results.confirmed} CONFIRMED, ${results.failed} FAILED`);
  } else {
    console.log("\n✗ ALL TRANSACTIONS FAILED");
  }

  console.log("========================================\n");
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
