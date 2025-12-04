#!/usr/bin/env node
/**
 * Test ALL Casino Games on Devnet
 * - War, Sic Bo, Three Card Poker, Video Poker, UTH
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
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Devnet mint addresses
const MINTS = {
  WAR: new PublicKey("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz"),
  SICO: new PublicKey("5UkoVvbA7xNy9ysGVvw2hDpos6mMXJ7xRDKusV6QDEVr"),
  TCP: new PublicKey("3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth"),
  VPK: new PublicKey("GNPiaDCr18GZ4PKcHDEFuAXkisBpN2aosBruqNAdXT2W"),
  UTH: new PublicKey("2yEhxizZGU27xB3HdjMKEVtJN5C6WrG241Lu3QcYbt5u"),
};

// Game configurations
const GAMES = {
  WAR: {
    gameSeeds: ["war_game"],
    positionSeeds: ["war_position"],
    vaultSeeds: ["war_vault"],
    mint: MINTS.WAR,
    placeBetDiscriminator: 48,
    // PlaceWarBet: ante(8) + tie_bet(8) = 16 bytes
    buildBetData: (amount) => {
      const data = Buffer.alloc(17);
      data[0] = 48;
      data.writeBigUInt64LE(amount, 1); // ante
      data.writeBigUInt64LE(0n, 9); // tie_bet (optional)
      return data;
    },
    accounts: (signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, mint) => [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  },
  SICO: {
    gameSeeds: ["sicbo_game"],
    positionSeeds: ["sicbo_position"],
    vaultSeeds: ["sicbo_vault"],
    mint: MINTS.SICO,
    placeBetDiscriminator: 54,
    // PlaceSicBoBet: bet_type(1) + position(1) + _padding(6) + amount(8) = 16 bytes
    // bet_type: 0=Small, 1=Big
    buildBetData: (amount) => {
      const data = Buffer.alloc(17); // 1 + 16
      data[0] = 54; // discriminator
      data[1] = 1;  // bet_type = Big (sums 11-17)
      data[2] = 0;  // position (not used for big/small)
      // padding at 3-8
      data.writeBigUInt64LE(amount, 9); // amount at offset 9
      return data;
    },
    accounts: (signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, mint) => [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  },
  TCP: {
    gameSeeds: ["threecard_game"],
    positionSeeds: ["threecard_position"],
    vaultSeeds: ["threecard_vault"],
    mint: MINTS.TCP,
    placeBetDiscriminator: 58,
    // PlaceThreeCardBet: ante(8) + pair_plus(8) = 16 bytes
    buildBetData: (amount) => {
      const data = Buffer.alloc(17);
      data[0] = 58;
      data.writeBigUInt64LE(amount, 1); // ante
      data.writeBigUInt64LE(0n, 9); // pair_plus (optional)
      return data;
    },
    accounts: (signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, mint) => [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  },
  VPK: {
    gameSeeds: ["video_poker_game"],
    positionSeeds: ["video_poker_position"],
    vaultSeeds: ["video_poker_vault"],
    mint: MINTS.VPK,
    placeBetDiscriminator: 64,
    // PlaceVideoPokerBet: coins(1) + _padding(7) + amount_per_coin(8) = 16 bytes
    buildBetData: (amount) => {
      const data = Buffer.alloc(17); // 1 + 16
      data[0] = 64; // discriminator
      data[1] = 1;  // coins = 1
      // padding at 2-8
      data.writeBigUInt64LE(amount, 9); // amount_per_coin at offset 9
      return data;
    },
    // VPK needs 11 accounts including round at position 3
    needsRound: true,
    accounts: (signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, mint, roundPda) => [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: false }, // round for RNG
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  },
  UTH: {
    gameSeeds: ["uth_game"],
    positionSeeds: ["uth_position"],
    vaultSeeds: ["uth_vault"],
    mint: MINTS.UTH,
    placeBetDiscriminator: 69,
    // PlaceUTHAnte: ante(8) + trips_bet(8) = 16 bytes
    buildBetData: (amount) => {
      const data = Buffer.alloc(17);
      data[0] = 69;
      data.writeBigUInt64LE(amount, 1); // ante
      data.writeBigUInt64LE(0n, 9); // trips_bet (optional)
      return data;
    },
    // UTH needs 12 accounts including sysvars
    accounts: (signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, mint) => [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gamePda, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarC1ock11111111111111111111111111111111"), isSigner: false, isWritable: false }, // Clock
      { pubkey: new PublicKey("SysvarS1otHashes111111111111111111111111111"), isSigner: false, isWritable: false }, // SlotHashes
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  },
};

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function ensureATA(connection, payer, mint, owner, allowOwnerOffCurve = false) {
  const ata = await getAssociatedTokenAddress(mint, owner, allowOwnerOffCurve);
  const info = await connection.getAccountInfo(ata);
  if (!info) {
    console.log(`  Creating ATA for ${owner.toBase58().slice(0, 8)}...`);
    const tx = new Transaction().add(
      createAssociatedTokenAccountInstruction(payer.publicKey, ata, owner, mint)
    );
    await sendAndConfirmTransaction(connection, tx, [payer]);
  }
  return ata;
}

async function testGame(connection, signer, gameName, config) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TESTING ${gameName}`);
  console.log("=".repeat(60));

  const [gamePda] = findPDA([Buffer.from(config.gameSeeds[0])], ORE_PROGRAM_ID);
  const [vaultPda] = findPDA([Buffer.from(config.vaultSeeds[0])], ORE_PROGRAM_ID);
  const [positionPda] = findPDA(
    [Buffer.from(config.positionSeeds[0]), signer.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );

  console.log(`Game PDA: ${gamePda.toBase58()}`);
  console.log(`Position PDA: ${positionPda.toBase58()}`);
  console.log(`Vault PDA: ${vaultPda.toBase58()}`);

  // Check if game is initialized
  const gameAccount = await connection.getAccountInfo(gamePda);
  if (!gameAccount) {
    console.log(`ERROR: ${gameName} game not initialized!`);
    return { game: gameName, status: "NOT_INITIALIZED" };
  }

  const bankroll = gameAccount.data.readBigUInt64LE(16);
  console.log(`House bankroll: ${bankroll}`);

  if (bankroll === 0n) {
    console.log(`ERROR: ${gameName} has no bankroll!`);
    return { game: gameName, status: "NO_BANKROLL" };
  }

  // Get ATAs
  const signerAta = await ensureATA(connection, signer, config.mint, signer.publicKey);
  const vaultAta = await ensureATA(connection, signer, config.mint, vaultPda, true);

  // Check signer balance
  let balance;
  try {
    const balanceResp = await connection.getTokenAccountBalance(signerAta);
    balance = BigInt(balanceResp.value.amount);
    console.log(`Signer token balance: ${balanceResp.value.uiAmount}`);

    if (balance < BigInt(1_000_000_000)) {
      console.log(`ERROR: Insufficient balance (need at least 1 token)`);
      return { game: gameName, status: "INSUFFICIENT_BALANCE" };
    }
  } catch (e) {
    console.log(`ERROR: No token balance: ${e.message}`);
    return { game: gameName, status: "NO_TOKEN_ACCOUNT" };
  }

  // Check if position has active hand
  const positionAccount = await connection.getAccountInfo(positionPda);
  if (positionAccount) {
    // Check state byte - varies by game but usually around offset 40-50
    // For now, we'll just try to place the bet and see if it fails
    console.log(`Position exists, will check for active hand...`);
  }

  // Get round PDA if needed
  let roundPda = null;
  if (config.needsRound) {
    // Get board to find current round
    const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
    const boardAccount = await connection.getAccountInfo(boardPda);
    if (!boardAccount) {
      console.log(`ERROR: Board not initialized for round PDA`);
      return { game: gameName, status: "NO_BOARD" };
    }
    const roundId = boardAccount.data.readBigUInt64LE(8);
    const roundIdBytes = Buffer.alloc(8);
    roundIdBytes.writeBigUInt64LE(roundId);
    [roundPda] = findPDA([Buffer.from("round"), roundIdBytes], ORE_PROGRAM_ID);
    console.log(`Round PDA: ${roundPda.toBase58()} (round ${roundId})`);
  }

  // Build bet instruction
  const betAmount = BigInt(1_000_000_000); // 1 token
  const data = config.buildBetData(betAmount);

  const keys = config.needsRound
    ? config.accounts(signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, config.mint, roundPda)
    : config.accounts(signer, gamePda, positionPda, vaultPda, signerAta, vaultAta, config.mint);

  const instruction = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys,
    data,
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = signer.publicKey;

  // Simulate first
  console.log(`\nSimulating PlaceBet...`);
  try {
    const simulation = await connection.simulateTransaction(tx, [signer]);

    if (simulation.value.err) {
      console.log(`Simulation failed:`, JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log(`  ${log}`));
      return { game: gameName, status: "SIMULATION_FAILED", error: simulation.value.err };
    }

    console.log(`Simulation passed!`);
    simulation.value.logs?.slice(-5).forEach(log => console.log(`  ${log}`));
  } catch (e) {
    console.log(`Simulation error: ${e.message}`);
    return { game: gameName, status: "SIMULATION_ERROR", error: e.message };
  }

  // Send transaction
  console.log(`\nSending transaction...`);
  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log(`SUCCESS! Signature: ${sig}`);
    return { game: gameName, status: "SUCCESS", signature: sig };
  } catch (e) {
    console.log(`Transaction failed: ${e.message}`);
    if (e.logs) e.logs.slice(-10).forEach(log => console.log(`  ${log}`));
    return { game: gameName, status: "TX_FAILED", error: e.message };
  }
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("=".repeat(60));
  console.log("TEST ALL CASINO GAMES ON DEVNET");
  console.log("=".repeat(60));
  console.log("Signer:", signer.publicKey.toBase58());

  const results = [];

  for (const [gameName, config] of Object.entries(GAMES)) {
    const result = await testGame(connection, signer, gameName, config);
    results.push(result);
  }

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  for (const result of results) {
    const statusEmoji = result.status === "SUCCESS" ? "✅" : "❌";
    console.log(`  ${statusEmoji} ${result.game}: ${result.status}`);
    if (result.error) console.log(`     Error: ${result.error}`);
    if (result.signature) console.log(`     Sig: ${result.signature.slice(0, 20)}...`);
  }
}

main().catch(console.error);
