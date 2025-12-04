#!/usr/bin/env node
/**
 * Fund All Games on Devnet
 *
 * This script initializes/funds all games that have instruction builders:
 * - Roulette (FundRouletteHouse = 47)
 * - UTH (FundUTHHouse = 75)
 *
 * Note: War, ThreeCard, VideoPoker, SicBo need instruction builders added first.
 */
import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  getProgramDerivedAddress,
  createKeyPairSignerFromBytes,
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  AccountRole,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getMintToInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";
import fs from "fs";

// Devnet configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const DEVNET_RPC_WS = "wss://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Devnet token mints
const MINTS = {
  ROUL: address("34rCuo8DHHJaJTuEUF8NAXE7h8aBumqDpd48NfgXWVPi"),
  UTH: address("2yEhxizZGU27xB3HdjMKEVtJN5C6WrG241Lu3QcYbt5u"),
  WAR: address("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz"),
  TCP: address("3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth"),
  VPK: address("GNPiaDCr18GZ4PKcHDEFuAXkisBpN2aosBruqNAdXT2W"),
  SICO: address("5UkoVvbA7xNy9ysGVvw2hDpos6mMXJ7xRDKusV6QDEVr"),
};

// Game configurations
const GAMES = {
  roulette: {
    name: "Roulette",
    mint: MINTS.ROUL,
    discriminator: 47, // FundRouletteHouse
    gameSeed: "roulette_game",
    vaultSeed: "roulette_vault",
  },
  uth: {
    name: "UTH",
    mint: MINTS.UTH,
    discriminator: 75, // FundUTHHouse
    gameSeed: "uth_game",
    vaultSeed: "uth_vault",
  },
  war: {
    name: "War",
    mint: MINTS.WAR,
    discriminator: 53, // FundWarHouse
    gameSeed: "war_game",
    vaultSeed: "war_vault",
  },
  threeCard: {
    name: "Three Card Poker",
    mint: MINTS.TCP,
    discriminator: 63, // FundThreeCardHouse
    gameSeed: "threecard_game",
    vaultSeed: "threecard_vault",
  },
  videoPoker: {
    name: "Video Poker",
    mint: MINTS.VPK,
    discriminator: 68, // FundVideoPokerHouse
    gameSeed: "video_poker_game",
    vaultSeed: "video_poker_vault",
  },
  sicbo: {
    name: "Sic Bo",
    mint: MINTS.SICO,
    discriminator: 57, // FundSicBoHouse
    gameSeed: "sicbo_game",
    vaultSeed: "sicbo_vault",
  },
};

// PDA helpers
async function getGamePDA(seed) {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode(seed)],
  });
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

// Create FundHouse instruction (same pattern for all games)
function createFundHouseInstruction(
  signer,
  gameAddress,
  vaultAddress,
  signerAta,
  vaultAta,
  mint,
  discriminator,
  amount
) {
  const data = new Uint8Array(9);
  data[0] = discriminator;
  data.set(toLeBytes(BigInt(amount), 8), 1);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: gameAddress, role: AccountRole.WRITABLE },
      { address: vaultAddress, role: AccountRole.READONLY },
      { address: signerAta, role: AccountRole.WRITABLE },
      { address: vaultAta, role: AccountRole.WRITABLE },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: ASSOCIATED_TOKEN_PROGRAM_ADDRESS, role: AccountRole.READONLY },
    ],
    data,
  };
}

async function fundGame(rpc, rpcSubscriptions, admin, gameConfig, fundAmount) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`FUNDING ${gameConfig.name.toUpperCase()}`);
  console.log(`${"=".repeat(60)}`);

  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  const [gameAddress] = await getGamePDA(gameConfig.gameSeed);
  const [vaultAddress] = await getGamePDA(gameConfig.vaultSeed);

  // Get ATAs
  const [signerAta] = await findAssociatedTokenPda({
    mint: gameConfig.mint,
    owner: admin.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [vaultAta] = await findAssociatedTokenPda({
    mint: gameConfig.mint,
    owner: vaultAddress,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  console.log(`Mint: ${gameConfig.mint.toString()}`);
  console.log(`Game PDA: ${gameAddress}`);
  console.log(`Vault PDA: ${vaultAddress}`);
  console.log(`Admin ATA: ${signerAta}`);
  console.log(`Vault ATA: ${vaultAta}`);

  // Check if game already exists
  const gameAccount = await rpc.getAccountInfo(gameAddress, { encoding: "base64" }).send();
  if (gameAccount.value) {
    console.log(`\n${gameConfig.name} game already exists!`);
    const data = Buffer.from(gameAccount.value.data[0], "base64");
    if (data.length >= 27) {
      const ONE_TOKEN = 1_000_000_000n;
      // Try to read house_bankroll (usually at offset 8+8+3 = 19 for craps-like, or offset 16 for others)
      try {
        const bankroll = Number(data.readBigUInt64LE(16)) / Number(ONE_TOKEN);
        console.log(`Current house bankroll: ${bankroll.toLocaleString()} tokens`);
      } catch (e) {
        console.log(`Data length: ${data.length} bytes`);
      }
    }
    return { success: true, existed: true };
  }

  // Step 1: Create admin's token ATA if needed
  const adminAtaInfo = await rpc.getAccountInfo(signerAta, { encoding: "base64" }).send();
  if (!adminAtaInfo.value) {
    console.log("\nCreating admin token ATA...");
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
      payer: admin,
      owner: admin.address,
      mint: gameConfig.mint,
      ata: signerAta,
    });

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(admin, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(createAtaIx, m),
    );

    const signedTx = await signTransactionMessageWithSigners(tx);
    const sig = getSignatureFromTransaction(signedTx);
    await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
    console.log(`  Created admin ATA! Sig: ${sig.slice(0, 20)}...`);
  } else {
    console.log("\nAdmin token ATA already exists");
  }

  // Step 2: Mint tokens to admin
  const ONE_TOKEN = 1_000_000_000n; // 9 decimals
  const mintAmount = 1_000_000n * ONE_TOKEN; // 1 million tokens

  console.log(`\nMinting 1,000,000 ${gameConfig.name} tokens to admin...`);
  const { value: latestBlockhash1 } = await rpc.getLatestBlockhash().send();

  const mintIx = getMintToInstruction({
    mint: gameConfig.mint,
    token: signerAta,
    mintAuthority: admin,
    amount: mintAmount,
  });

  const mintTx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash1, m),
    (m) => appendTransactionMessageInstruction(mintIx, m),
  );

  try {
    const signedMintTx = await signTransactionMessageWithSigners(mintTx);
    const mintSig = getSignatureFromTransaction(signedMintTx);
    await sendAndConfirmTransaction(signedMintTx, { commitment: "confirmed" });
    console.log(`  Minted! Sig: ${mintSig.slice(0, 20)}...`);
  } catch (e) {
    console.log(`  Mint note: ${e.message?.slice(0, 100) || "May already have tokens"}`);
  }

  // Check admin balance
  try {
    const adminBalance = await rpc.getTokenAccountBalance(signerAta).send();
    console.log(`  Admin balance: ${adminBalance.value.uiAmount?.toLocaleString()} tokens`);
  } catch (e) {
    console.log(`  Could not fetch balance`);
  }

  // Step 3: Fund the house
  const fundAmountUnits = BigInt(fundAmount) * ONE_TOKEN;
  console.log(`\nFunding ${gameConfig.name} house with ${fundAmount.toLocaleString()} tokens...`);

  const { value: latestBlockhash2 } = await rpc.getLatestBlockhash().send();

  const fundIx = createFundHouseInstruction(
    admin,
    gameAddress,
    vaultAddress,
    signerAta,
    vaultAta,
    gameConfig.mint,
    gameConfig.discriminator,
    fundAmountUnits
  );

  const fundTx = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash2, m),
    (m) => appendTransactionMessageInstruction(fundIx, m),
  );

  try {
    const signedFundTx = await signTransactionMessageWithSigners(fundTx);
    const sig = getSignatureFromTransaction(signedFundTx);
    await sendAndConfirmTransaction(signedFundTx, { commitment: "confirmed" });
    console.log(`  SUCCESS! Sig: ${sig.slice(0, 20)}...`);

    // Verify
    const gameAfter = await rpc.getAccountInfo(gameAddress, { encoding: "base64" }).send();
    if (gameAfter.value) {
      console.log(`  Game account created!`);
      console.log(`  Data length: ${Buffer.from(gameAfter.value.data[0], "base64").length} bytes`);
    }

    return { success: true };
  } catch (e) {
    console.log(`  ERROR: ${e.message?.slice(0, 300) || e.toString()}`);
    if (e.logs) {
      console.log(`  Logs:\n    ${e.logs.slice(-5).join("\n    ")}`);
    }
    return { success: false, error: e.message };
  }
}

async function main() {
  console.log("============================================================");
  console.log("FUNDING ALL GAMES ON DEVNET");
  console.log("============================================================");
  console.log("RPC:", DEVNET_RPC.replace(/api-key=.*/, "api-key=***"));

  const rpc = createSolanaRpc(DEVNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(DEVNET_RPC_WS);

  // Load admin keypair
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH || "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  console.log("\nAdmin:", admin.address);

  // Check SOL balance
  const balance = await rpc.getBalance(admin.address).send();
  console.log("SOL balance:", Number(balance.value) / 1e9, "SOL");

  if (balance.value < 100000000n) {
    console.log("WARNING: Low SOL balance. You may need more SOL.");
  }

  const fundAmount = 100_000; // 100k tokens per game
  const results = {};

  // Fund games that have instruction builders
  const gamesToFund = ["roulette", "uth", "war", "threeCard", "videoPoker", "sicbo"];

  for (const gameKey of gamesToFund) {
    const config = GAMES[gameKey];
    if (!config) {
      console.log(`\nSkipping ${gameKey} - no config`);
      continue;
    }

    try {
      results[gameKey] = await fundGame(rpc, rpcSubscriptions, admin, config, fundAmount);
    } catch (e) {
      console.log(`\nFailed to fund ${config.name}: ${e.message}`);
      results[gameKey] = { success: false, error: e.message };
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  for (const [game, result] of Object.entries(results)) {
    const status = result.success
      ? result.existed
        ? "ALREADY EXISTS"
        : "FUNDED"
      : "FAILED";
    console.log(`  ${game}: ${status}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("DONE");
  console.log("=".repeat(60));
}

main().catch(console.error);
