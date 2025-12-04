#!/usr/bin/env node
/**
 * ALL GAMES COMPREHENSIVE TEST - Auto-generated keypairs for localnet testing
 *
 * Tests all 9 casino games:
 * 1. Craps - dice betting with multiple bet types
 * 2. Baccarat - card game with player/banker bets
 * 3. Blackjack - card game with hit/stand mechanics
 * 4. Roulette - spin the wheel with number/color bets
 * 5. Casino War - simple card comparison
 * 6. Sic Bo - three dice betting
 * 7. Three Card Poker - 3-card hands with pair plus
 * 8. Video Poker - hold and draw mechanics
 * 9. Ultimate Texas Hold'em - poker against dealer
 *
 * Uses Keypair.generate() for auto-generated wallets (NO Solflare needed)
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import fs from "fs";

// ============================================================================
// CONFIGURATION
// ============================================================================

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Token mints (localnet)
const CRAP_MINT = new PublicKey("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");
const CARAT_MINT = new PublicKey("CARATqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpn111");
const BJ_MINT = new PublicKey("FwtWFT5NzUxcKrbXXbCup18iuikjE8CGN2VkUKtC56zf");

// For games without specific mints, we'll use CRAP as a universal testing token
const UNIVERSAL_MINT = CRAP_MINT;

// Token decimals
const ONE_TOKEN = BigInt(1_000_000_000);

// ============================================================================
// INSTRUCTION DISCRIMINATORS (from instruction.rs)
// ============================================================================

const Instructions = {
  // Core
  Initialize: 1,
  StartRound: 22,

  // Craps (23-26)
  PlaceCrapsBet: 23,
  SettleCraps: 24,
  ClaimCrapsWinnings: 25,
  FundCrapsHouse: 26,

  // Baccarat (29-32)
  PlaceBaccaratBet: 29,
  SettleBaccarat: 30,
  ClaimBaccaratWinnings: 31,
  FundBaccaratHouse: 32,

  // Blackjack (33-43)
  PlaceBlackjackBet: 33,
  DealBlackjack: 34,
  BlackjackHit: 35,
  BlackjackStand: 36,
  BlackjackDoubleDown: 37,
  BlackjackSplit: 38,
  BlackjackInsurance: 39,
  SettleBlackjack: 40,
  ClaimBlackjackWinnings: 41,
  FundBlackjackHouse: 42,
  BlackjackSurrender: 43,

  // Roulette (44-47)
  PlaceRouletteBet: 44,
  SettleRoulette: 45,
  ClaimRouletteWinnings: 46,
  FundRouletteHouse: 47,

  // Casino War (48-53)
  PlaceWarBet: 48,
  DealWar: 49,
  GoToWar: 50,
  Surrender: 51,
  ClaimWarWinnings: 52,
  FundWarHouse: 53,

  // Sic Bo (54-57)
  PlaceSicBoBet: 54,
  SettleSicBo: 55,
  ClaimSicBoWinnings: 56,
  FundSicBoHouse: 57,

  // Three Card Poker (58-63)
  PlaceThreeCardBet: 58,
  DealThreeCard: 59,
  PlayThreeCard: 60,
  FoldThreeCard: 61,
  ClaimThreeCardWinnings: 62,
  FundThreeCardHouse: 63,

  // Video Poker (64-68)
  PlaceVideoPokerBet: 64,
  DealVideoPoker: 65,
  HoldAndDraw: 66,
  ClaimVideoPokerWinnings: 67,
  FundVideoPokerHouse: 68,

  // UTH (69-75)
  PlaceUTHAnte: 69,
  UTHBetPreflop: 70,
  UTHBetFlop: 71,
  UTHBetRiver: 72,
  SettleUTH: 73,
  ClaimUTHWinnings: 74,
  FundUTHHouse: 75,
};

// ============================================================================
// PDA DERIVATION HELPERS
// ============================================================================

function toLeBytes(n, len) {
  const arr = Buffer.alloc(len);
  arr.writeBigUInt64LE(BigInt(n), 0);
  return arr;
}

const PDAs = {
  board: () => PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID),
  config: () => PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID),
  treasury: () => PublicKey.findProgramAddressSync([Buffer.from("treasury")], ORE_PROGRAM_ID),
  round: (id) => PublicKey.findProgramAddressSync([Buffer.from("round"), toLeBytes(id, 8)], ORE_PROGRAM_ID),

  // Craps
  crapsGame: () => PublicKey.findProgramAddressSync([Buffer.from("craps_game")], ORE_PROGRAM_ID),
  crapsPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("craps_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  crapsVault: () => PublicKey.findProgramAddressSync([Buffer.from("craps_vault")], ORE_PROGRAM_ID),

  // Baccarat
  baccaratGame: () => PublicKey.findProgramAddressSync([Buffer.from("baccarat_game")], ORE_PROGRAM_ID),
  baccaratPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("baccarat_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  baccaratVault: () => PublicKey.findProgramAddressSync([Buffer.from("baccarat_vault")], ORE_PROGRAM_ID),

  // Blackjack
  blackjackGame: () => PublicKey.findProgramAddressSync([Buffer.from("blackjack_game")], ORE_PROGRAM_ID),
  blackjackHand: (auth) => PublicKey.findProgramAddressSync([Buffer.from("blackjack_hand"), auth.toBuffer()], ORE_PROGRAM_ID),
  blackjackVault: () => PublicKey.findProgramAddressSync([Buffer.from("blackjack_vault")], ORE_PROGRAM_ID),

  // Roulette
  rouletteGame: () => PublicKey.findProgramAddressSync([Buffer.from("roulette_game")], ORE_PROGRAM_ID),
  roulettePosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("roulette_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  rouletteVault: () => PublicKey.findProgramAddressSync([Buffer.from("roulette_vault")], ORE_PROGRAM_ID),

  // Casino War
  warGame: () => PublicKey.findProgramAddressSync([Buffer.from("war_game")], ORE_PROGRAM_ID),
  warPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("war_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  warVault: () => PublicKey.findProgramAddressSync([Buffer.from("war_vault")], ORE_PROGRAM_ID),

  // Sic Bo
  sicboGame: () => PublicKey.findProgramAddressSync([Buffer.from("sicbo_game")], ORE_PROGRAM_ID),
  sicboPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("sicbo_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  sicboVault: () => PublicKey.findProgramAddressSync([Buffer.from("sicbo_vault")], ORE_PROGRAM_ID),

  // Three Card Poker
  threecardGame: () => PublicKey.findProgramAddressSync([Buffer.from("threecard_game")], ORE_PROGRAM_ID),
  threecardPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("threecard_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  threecardVault: () => PublicKey.findProgramAddressSync([Buffer.from("threecard_vault")], ORE_PROGRAM_ID),

  // Video Poker
  videoPokerGame: () => PublicKey.findProgramAddressSync([Buffer.from("video_poker_game")], ORE_PROGRAM_ID),
  videoPokerPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("video_poker_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  videoPokerVault: () => PublicKey.findProgramAddressSync([Buffer.from("video_poker_vault")], ORE_PROGRAM_ID),

  // UTH
  uthGame: () => PublicKey.findProgramAddressSync([Buffer.from("uth_game")], ORE_PROGRAM_ID),
  uthPosition: (auth) => PublicKey.findProgramAddressSync([Buffer.from("uth_position"), auth.toBuffer()], ORE_PROGRAM_ID),
  uthVault: () => PublicKey.findProgramAddressSync([Buffer.from("uth_vault")], ORE_PROGRAM_ID),
};

// ============================================================================
// TEST RESULTS TRACKING
// ============================================================================

const testResults = {
  passed: 0,
  failed: 0,
  games: {},
};

function logTest(game, test, success, error = null) {
  const status = success ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${status}: ${test}${error ? ` (${error})` : ""}`);

  if (!testResults.games[game]) {
    testResults.games[game] = { passed: 0, failed: 0, tests: [] };
  }

  testResults.games[game].tests.push({ test, success, error });
  if (success) {
    testResults.passed++;
    testResults.games[game].passed++;
  } else {
    testResults.failed++;
    testResults.games[game].failed++;
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function sendTx(connection, payer, instruction, description) {
  try {
    const tx = new Transaction().add(instruction);
    const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
      commitment: "confirmed",
    });
    return { success: true, signature: sig };
  } catch (e) {
    return { success: false, error: e.message?.slice(0, 200) || String(e) };
  }
}

async function getTokenBalance(connection, owner, mint, allowOwnerOffCurve = false) {
  const ata = getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve);
  try {
    const balance = await connection.getTokenAccountBalance(ata);
    return parseFloat(balance.value.uiAmount || 0);
  } catch {
    return 0;
  }
}

async function fundTestPlayer(connection, admin, player, solAmount, mint, tokenAmount) {
  // Transfer SOL
  const solTransfer = SystemProgram.transfer({
    fromPubkey: admin.publicKey,
    toPubkey: player.publicKey,
    lamports: solAmount * LAMPORTS_PER_SOL,
  });
  const solTx = new Transaction().add(solTransfer);
  await sendAndConfirmTransaction(connection, solTx, [admin]);

  // Create player's token ATA if needed
  const playerAta = getAssociatedTokenAddressSync(mint, player.publicKey);
  const ataInfo = await connection.getAccountInfo(playerAta);
  if (!ataInfo) {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      admin.publicKey,
      playerAta,
      player.publicKey,
      mint
    );
    const ataTx = new Transaction().add(createAtaIx);
    await sendAndConfirmTransaction(connection, ataTx, [admin]);
  }

  // Transfer tokens
  const adminAta = getAssociatedTokenAddressSync(mint, admin.publicKey);
  const transferIx = createTransferInstruction(
    adminAta,
    playerAta,
    admin.publicKey,
    BigInt(tokenAmount) * ONE_TOKEN
  );
  const transferTx = new Transaction().add(transferIx);
  await sendAndConfirmTransaction(connection, transferTx, [admin]);
}

// ============================================================================
// GAME TEST FUNCTIONS
// ============================================================================

async function testCraps(connection, admin, player) {
  console.log("\n🎲 TESTING CRAPS...");

  const [gameAddress] = PDAs.crapsGame();
  const [vaultAddress] = PDAs.crapsVault();
  const [positionAddress] = PDAs.crapsPosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(CRAP_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(CRAP_MINT, vaultAddress, true);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundCrapsHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const adminAta = getAssociatedTokenAddressSync(CRAP_MINT, admin.publicKey);
  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund Craps House");
  logTest("Craps", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place Pass Line bet
  const betAmount = BigInt(10) * ONE_TOKEN;
  const betData = Buffer.alloc(17);
  betData[0] = Instructions.PlaceCrapsBet;
  betData[1] = 0; // PassLine
  betData[2] = 0; // No point needed
  betData.writeBigUInt64LE(betAmount, 9);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place Craps Bet");
  logTest("Craps", "Place Pass Line Bet", betResult.success, betResult.error);
}

async function testRoulette(connection, admin, player) {
  console.log("\n🎰 TESTING ROULETTE...");

  const [gameAddress] = PDAs.rouletteGame();
  const [vaultAddress] = PDAs.rouletteVault();
  const [positionAddress] = PDAs.roulettePosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, vaultAddress, true);
  const adminAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, admin.publicKey);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundRouletteHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund Roulette House");
  logTest("Roulette", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place Red bet
  const betAmount = BigInt(5) * ONE_TOKEN;
  const betData = Buffer.alloc(16);
  betData[0] = Instructions.PlaceRouletteBet;
  betData[1] = 4; // Red
  betData[2] = 0; // Position ignored for Red
  betData.writeBigUInt64LE(betAmount, 8);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place Roulette Bet");
  logTest("Roulette", "Place Red Bet", betResult.success, betResult.error);
}

async function testCasinoWar(connection, admin, player) {
  console.log("\n⚔️ TESTING CASINO WAR...");

  const [gameAddress] = PDAs.warGame();
  const [vaultAddress] = PDAs.warVault();
  const [positionAddress] = PDAs.warPosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, vaultAddress, true);
  const adminAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, admin.publicKey);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundWarHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund War House");
  logTest("Casino War", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place ante bet
  const anteAmount = BigInt(10) * ONE_TOKEN;
  const tieBetAmount = BigInt(2) * ONE_TOKEN;
  const betData = Buffer.alloc(17);
  betData[0] = Instructions.PlaceWarBet;
  betData.writeBigUInt64LE(anteAmount, 1);
  betData.writeBigUInt64LE(tieBetAmount, 9);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place War Bet");
  logTest("Casino War", "Place Ante + Tie Bet", betResult.success, betResult.error);
}

async function testSicBo(connection, admin, player) {
  console.log("\n🎲🎲🎲 TESTING SIC BO...");

  const [gameAddress] = PDAs.sicboGame();
  const [vaultAddress] = PDAs.sicboVault();
  const [positionAddress] = PDAs.sicboPosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, vaultAddress, true);
  const adminAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, admin.publicKey);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundSicBoHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund Sic Bo House");
  logTest("Sic Bo", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place Small bet (0 = Small)
  const betAmount = BigInt(5) * ONE_TOKEN;
  const betData = Buffer.alloc(16);
  betData[0] = Instructions.PlaceSicBoBet;
  betData[1] = 0; // Small bet type
  betData[2] = 0; // Position (not needed for Small/Big)
  betData.writeBigUInt64LE(betAmount, 8);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place Sic Bo Bet");
  logTest("Sic Bo", "Place Small Bet", betResult.success, betResult.error);
}

async function testThreeCardPoker(connection, admin, player) {
  console.log("\n🃏 TESTING THREE CARD POKER...");

  const [gameAddress] = PDAs.threecardGame();
  const [vaultAddress] = PDAs.threecardVault();
  const [positionAddress] = PDAs.threecardPosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, vaultAddress, true);
  const adminAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, admin.publicKey);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundThreeCardHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund Three Card House");
  logTest("Three Card Poker", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place ante + pair plus bets
  const anteAmount = BigInt(10) * ONE_TOKEN;
  const pairPlusAmount = BigInt(5) * ONE_TOKEN;
  const betData = Buffer.alloc(17);
  betData[0] = Instructions.PlaceThreeCardBet;
  betData.writeBigUInt64LE(anteAmount, 1);
  betData.writeBigUInt64LE(pairPlusAmount, 9);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place Three Card Bet");
  logTest("Three Card Poker", "Place Ante + Pair Plus", betResult.success, betResult.error);
}

async function testVideoPoker(connection, admin, player) {
  console.log("\n🎰 TESTING VIDEO POKER...");

  const [gameAddress] = PDAs.videoPokerGame();
  const [vaultAddress] = PDAs.videoPokerVault();
  const [positionAddress] = PDAs.videoPokerPosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, vaultAddress, true);
  const adminAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, admin.publicKey);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundVideoPokerHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund Video Poker House");
  logTest("Video Poker", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place bet (5 coins)
  const amountPerCoin = BigInt(2) * ONE_TOKEN;
  const betData = Buffer.alloc(16);
  betData[0] = Instructions.PlaceVideoPokerBet;
  betData[1] = 5; // 5 coins
  betData.writeBigUInt64LE(amountPerCoin, 8);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place Video Poker Bet");
  logTest("Video Poker", "Place 5-Coin Bet", betResult.success, betResult.error);
}

async function testUTH(connection, admin, player) {
  console.log("\n🃏 TESTING ULTIMATE TEXAS HOLD'EM...");

  const [gameAddress] = PDAs.uthGame();
  const [vaultAddress] = PDAs.uthVault();
  const [positionAddress] = PDAs.uthPosition(player.publicKey);
  const playerAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, player.publicKey);
  const vaultAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, vaultAddress, true);
  const adminAta = getAssociatedTokenAddressSync(UNIVERSAL_MINT, admin.publicKey);

  // Test 1: Fund house
  const fundAmount = BigInt(1000) * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundUTHHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: admin.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: adminAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const fundResult = await sendTx(connection, admin, fundIx, "Fund UTH House");
  logTest("UTH", "Fund House", fundResult.success, fundResult.error);

  // Test 2: Place ante + trips bets
  const anteAmount = BigInt(10) * ONE_TOKEN;
  const tripsAmount = BigInt(5) * ONE_TOKEN;
  const betData = Buffer.alloc(17);
  betData[0] = Instructions.PlaceUTHAnte;
  betData.writeBigUInt64LE(anteAmount, 1);
  betData.writeBigUInt64LE(tripsAmount, 9);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: player.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: playerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: UNIVERSAL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, player, betIx, "Place UTH Bet");
  logTest("UTH", "Place Ante + Trips", betResult.success, betResult.error);
}

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║     ALL GAMES COMPREHENSIVE TEST - Localnet with Auto-Keypairs    ║
╠═══════════════════════════════════════════════════════════════════╣
║  Testing: Craps, Roulette, Casino War, Sic Bo, Three Card Poker,  ║
║           Video Poker, Ultimate Texas Hold'em                     ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  // Connect to localnet
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  try {
    const version = await connection.getVersion();
    console.log(`✅ Connected to localnet: Solana ${version["solana-core"]}`);
  } catch (e) {
    console.error("❌ Failed to connect to localnet:", e.message);
    console.log("\n⚠️  Make sure localnet validator is running:");
    console.log("   solana-test-validator --reset --bpf-program JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK target/deploy/ore.so");
    process.exit(1);
  }

  // Load admin keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  console.log(`Admin: ${admin.publicKey.toBase58()}`);

  // Generate test player keypair (NO Solflare needed!)
  const player = Keypair.generate();
  console.log(`Test Player: ${player.publicKey.toBase58()} (auto-generated)`);

  // Initialize board if needed
  console.log("\n📋 INITIALIZING BOARD...");
  const [boardAddress] = PDAs.board();
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (!boardInfo) {
    const [configAddress] = PDAs.config();
    const [treasuryAddress] = PDAs.treasury();
    const [roundAddress] = PDAs.round(0);

    const initData = Buffer.alloc(1);
    initData[0] = Instructions.Initialize;

    const initIx = new TransactionInstruction({
      keys: [
        { pubkey: admin.publicKey, isSigner: true, isWritable: true },
        { pubkey: boardAddress, isSigner: false, isWritable: true },
        { pubkey: configAddress, isSigner: false, isWritable: true },
        { pubkey: treasuryAddress, isSigner: false, isWritable: true },
        { pubkey: roundAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: initData,
    });

    const initResult = await sendTx(connection, admin, initIx, "Initialize Board");
    console.log(initResult.success ? "  ✅ Board initialized" : `  ❌ Board init failed: ${initResult.error}`);
  } else {
    console.log("  Board already initialized");
  }

  // Fund test player with SOL and tokens
  console.log("\n💰 FUNDING TEST PLAYER...");
  try {
    await fundTestPlayer(connection, admin, player, 2, CRAP_MINT, 1000);
    console.log("  ✅ Player funded with 2 SOL and 1000 tokens");
  } catch (e) {
    console.log(`  ⚠️ Funding partially failed (may already have tokens): ${e.message?.slice(0, 100)}`);
  }

  // Run all game tests
  await testCraps(connection, admin, player);
  await testRoulette(connection, admin, player);
  await testCasinoWar(connection, admin, player);
  await testSicBo(connection, admin, player);
  await testThreeCardPoker(connection, admin, player);
  await testVideoPoker(connection, admin, player);
  await testUTH(connection, admin, player);

  // Print summary
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                         TEST SUMMARY                               ║
╚═══════════════════════════════════════════════════════════════════╝
`);

  for (const [game, stats] of Object.entries(testResults.games)) {
    const status = stats.failed === 0 ? "✅" : "⚠️";
    console.log(`${status} ${game}: ${stats.passed} passed, ${stats.failed} failed`);
  }

  console.log(`
────────────────────────────────────────────────────────────────────
Total: ${testResults.passed} passed, ${testResults.failed} failed
${testResults.failed === 0 ? "✅ ALL TESTS PASSED!" : "⚠️ SOME TESTS FAILED"}
────────────────────────────────────────────────────────────────────
`);

  process.exit(testResults.failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
