#!/usr/bin/env node
/**
 * Devnet Comprehensive Test for Blackjack, Baccarat, and Roulette
 * Using @solana/web3.js (same pattern as working test scripts)
 *
 * Fixes:
 * - Blackjack: Added round account at index 3
 * - Baccarat: Initializes vault ATA if needed, funds house
 * - Roulette: Fixed settle instruction with round account and 8-byte round_id
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
  createAssociatedTokenAccountInstruction,
  getAccount
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

// Token mints from faucet
const BJ_MINT = new PublicKey("43pt8KeVq7Y8gTgeXj6aCZTUUYZnFJcnQUsGj8vno8nF");
const CARAT_MINT = new PublicKey("8ca5kPhhoSMmUinrLVSedhdBtTTtLCdh4jkyanjZML3N");
const ROUL_MINT = new PublicKey("34rCuo8DHHJaJTuEUF8NAXE7h8aBumqDpd48NfgXWVPi");

const ONE_TOKEN = 1_000_000_000n;

// Instruction discriminators
const Instructions = {
  // Blackjack
  PlaceBlackjackBet: 33,
  DealBlackjack: 34,
  BlackjackStand: 36,
  FundBlackjackHouse: 42,
  // Baccarat
  PlaceBaccaratBet: 29,
  SettleBaccarat: 30,
  FundBaccaratHouse: 32,
  // Roulette
  PlaceRouletteBet: 44,
  SettleRoulette: 45,
  FundRouletteHouse: 47,
};

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

// Get round PDA - seeds: ["round", round_id_le_bytes]
function findRoundPDA(roundId) {
  const roundIdBuffer = Buffer.alloc(8);
  roundIdBuffer.writeBigUInt64LE(BigInt(roundId), 0);
  return findPDA([Buffer.from("round"), roundIdBuffer], ORE_PROGRAM_ID);
}

async function sendTx(connection, signer, ix, desc) {
  try {
    const tx = new Transaction().add(ix);
    // Simulate first to get better error messages
    const sim = await connection.simulateTransaction(tx, [signer]);
    if (sim.value.err) {
      console.log(`Simulation failed:`, sim.value.logs?.slice(-5).join("\n  "));
      return { success: false, error: `Simulation failed: ${JSON.stringify(sim.value.err)}` };
    }
    console.log(`Simulation passed:`);
    sim.value.logs?.slice(0, 5).forEach(l => console.log(`   ${l}`));

    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: "confirmed",
    });
    return { success: true, signature: sig };
  } catch (e) {
    return { success: false, error: e.message?.slice(0, 200) || String(e) };
  }
}

async function sendMultiIxTx(connection, signer, instructions, desc) {
  try {
    const tx = new Transaction();
    for (const ix of instructions) {
      tx.add(ix);
    }
    // Simulate first
    const sim = await connection.simulateTransaction(tx, [signer]);
    if (sim.value.err) {
      console.log(`Simulation failed:`, sim.value.logs?.slice(-5).join("\n  "));
      return { success: false, error: `Simulation failed: ${JSON.stringify(sim.value.err)}` };
    }
    console.log(`Simulation passed for ${desc}`);

    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: "confirmed",
    });
    return { success: true, signature: sig };
  } catch (e) {
    return { success: false, error: e.message?.slice(0, 200) || String(e) };
  }
}

// ============================================================================
// HELPER: Find existing round or create one
// ============================================================================

async function findOrCreateRound(connection, signer) {
  // Try round IDs 1-10 to find an existing round
  for (let i = 1; i <= 10; i++) {
    const [roundAddress] = findRoundPDA(i);
    const roundInfo = await connection.getAccountInfo(roundAddress);
    if (roundInfo) {
      console.log(`Found existing round: ID=${i}, Address=${roundAddress.toBase58()}`);
      return { id: i, address: roundAddress };
    }
  }

  // No round found - try to start one (StartRound = 22)
  console.log("No existing round found. Checking board state...");

  // Get board PDA
  const [boardAddress] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const boardInfo = await connection.getAccountInfo(boardAddress);

  if (!boardInfo) {
    console.log("Board not initialized. Need to call Initialize first.");
    return null;
  }

  // Parse board to get current round ID
  const boardData = boardInfo.data;
  const currentRoundId = Number(boardData.readBigUInt64LE(8)); // offset 8 for round_id
  console.log(`Board current round: ${currentRoundId}`);

  // Try that round
  const [roundAddress] = findRoundPDA(currentRoundId);
  const roundInfo = await connection.getAccountInfo(roundAddress);
  if (roundInfo) {
    console.log(`Found current round: ID=${currentRoundId}, Address=${roundAddress.toBase58()}`);
    return { id: currentRoundId, address: roundAddress };
  }

  return null;
}

// ============================================================================
// HELPER: Ensure vault ATA exists
// ============================================================================

async function ensureVaultAta(connection, signer, vaultAddress, mint) {
  const vaultAta = await getAssociatedTokenAddress(mint, vaultAddress, true);

  try {
    await getAccount(connection, vaultAta);
    console.log(`Vault ATA exists: ${vaultAta.toBase58()}`);
    return vaultAta;
  } catch (e) {
    console.log(`Creating vault ATA: ${vaultAta.toBase58()}`);
    const createIx = createAssociatedTokenAccountInstruction(
      signer.publicKey,
      vaultAta,
      vaultAddress,
      mint
    );
    const result = await sendTx(connection, signer, createIx, "Create vault ATA");
    if (!result.success) {
      throw new Error(`Failed to create vault ATA: ${result.error}`);
    }
    return vaultAta;
  }
}

// ============================================================================
// BLACKJACK TEST
// ============================================================================

async function testBlackjack(connection, signer) {
  console.log("\n" + "=".repeat(60));
  console.log("TESTING BLACKJACK");
  console.log("=".repeat(60));

  const [gameAddress] = findPDA([Buffer.from("blackjack_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("blackjack_vault")], ORE_PROGRAM_ID);
  const [handAddress] = findPDA(
    [Buffer.from("blackjack_hand"), signer.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );

  const signerAta = await getAssociatedTokenAddress(BJ_MINT, signer.publicKey);
  const vaultAta = await getAssociatedTokenAddress(BJ_MINT, vaultAddress, true);

  console.log(`Game: ${gameAddress.toBase58()}`);
  console.log(`Hand PDA: ${handAddress.toBase58()}`);
  console.log(`Vault: ${vaultAddress.toBase58()}`);
  console.log(`Vault ATA: ${vaultAta.toBase58()}`);

  // Check BJ balance first
  let bjBalance = 0;
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    bjBalance = balance.value.uiAmount || 0;
    console.log(`BJ Balance: ${bjBalance} tokens`);
    if (bjBalance === 0) {
      console.log("ERROR: No BJ tokens. Use faucet first.");
      return { success: false, error: "No tokens" };
    }
  } catch (e) {
    console.log("ERROR: Could not check BJ balance. Use faucet first.");
    return { success: false, error: "No token account" };
  }

  // Ensure vault ATA exists (this is the key issue!)
  await ensureVaultAta(connection, signer, vaultAddress, BJ_MINT);

  // Check if game is funded
  const gameInfo = await connection.getAccountInfo(gameAddress);
  if (!gameInfo) {
    console.log("Blackjack game not funded. Funding house first...");
    await fundBlackjackHouse(connection, signer, vaultAddress, signerAta, vaultAta);
  } else {
    console.log("Blackjack game already funded");
  }

  // Find a round for RNG
  const round = await findOrCreateRound(connection, signer);
  if (!round) {
    console.log("ERROR: No round available for RNG.");
    return { success: false, error: "No round for RNG" };
  }

  // Check hand state to resume from appropriate step
  // States: None=0, Betting=1, Playing=2, DealerTurn=3, Settled=4
  const handInfo = await connection.getAccountInfo(handAddress);
  let handState = 0;
  if (handInfo) {
    // state is at offset: discriminator(8) + authority(32) + round_id(8) = 48
    handState = handInfo.data[48];
    console.log(`Hand exists with state: ${handState} (0=None, 1=Betting, 2=Playing, 3=DealerTurn, 4=Settled)`);
  } else {
    console.log(`No existing hand - will place fresh bet`);
  }

  // If state is 4 (Settled) or 0 (None), we can place a new bet
  // If state is 1 (Betting), jump to deal
  // If state is 2 (Playing), jump to stand
  // If state is 3 (DealerTurn), jump to settle

  // Step 1: Place bet (with round account at index 3) - only if state is 0 or 4
  if (handState === 0 || handState === 4) {
    console.log("\n--- STEP 1: PLACE BET ---");
    const betAmount = 1n * ONE_TOKEN;
    const betData = Buffer.alloc(9);
    betData[0] = Instructions.PlaceBlackjackBet;
    betData.writeBigUInt64LE(betAmount, 1);

    // Account layout: signer, game, hand, round, vault, signerAta, vaultAta, bjMint, system, token, ata
    const betIx = new TransactionInstruction({
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameAddress, isSigner: false, isWritable: true },
        { pubkey: handAddress, isSigner: false, isWritable: true },
        { pubkey: round.address, isSigner: false, isWritable: false }, // round at index 3
        { pubkey: vaultAddress, isSigner: false, isWritable: false },
        { pubkey: signerAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: BJ_MINT, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: betData,
    });

    const betResult = await sendTx(connection, signer, betIx, "Place bet");
    if (!betResult.success) {
      console.log(`Bet failed: ${betResult.error}`);
      return { success: false, error: betResult.error };
    }
    console.log(`Bet placed! Sig: ${betResult.signature.slice(0, 20)}...`);
    handState = 1; // Update state after bet
  } else {
    console.log("\n--- STEP 1: PLACE BET --- (SKIPPED - hand already has bet)");
  }

  // Step 2: Deal - only if state is 1 (betting/waiting for deal)
  if (handState === 1) {
    console.log("\n--- STEP 2: DEAL CARDS ---");
    const dealData = Buffer.alloc(1);
    dealData[0] = Instructions.DealBlackjack;

    // Account layout: signer, hand, round (NOT game!)
    const dealIx = new TransactionInstruction({
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: handAddress, isSigner: false, isWritable: true },
        { pubkey: round.address, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: dealData,
    });

    const dealResult = await sendTx(connection, signer, dealIx, "Deal cards");
    if (!dealResult.success) {
      console.log(`Deal failed: ${dealResult.error}`);
      return { success: false, error: dealResult.error };
    }
    console.log(`Cards dealt! Sig: ${dealResult.signature.slice(0, 20)}...`);
    handState = 2; // Cards dealt, now playing
  } else if (handState >= 2) {
    console.log("\n--- STEP 2: DEAL CARDS --- (SKIPPED - cards already dealt)");
  }

  // Step 3: Stand - only if state is 2 (playing)
  if (handState === 2) {
    console.log("\n--- STEP 3: STAND ---");
    const standData = Buffer.alloc(1);
    standData[0] = Instructions.BlackjackStand;

    const standIx = new TransactionInstruction({
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: handAddress, isSigner: false, isWritable: true },
      ],
      programId: ORE_PROGRAM_ID,
      data: standData,
    });

    const standResult = await sendTx(connection, signer, standIx, "Stand");
    if (!standResult.success) {
      console.log(`Stand failed: ${standResult.error}`);
      return { success: false, error: standResult.error };
    }
    console.log(`Stand executed! Sig: ${standResult.signature.slice(0, 20)}...`);
    handState = 3; // Stood, waiting for dealer
  } else if (handState >= 3) {
    console.log("\n--- STEP 3: STAND --- (SKIPPED - already stood or settled)");
  }

  // Step 4: Settle - only if state is 3 (dealer turn)
  if (handState === 3) {
    console.log("\n--- STEP 4: SETTLE ---");
    const settleData = Buffer.alloc(1);
    settleData[0] = 40; // SettleBlackjack = 40

    const settleIx = new TransactionInstruction({
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameAddress, isSigner: false, isWritable: true },
        { pubkey: handAddress, isSigner: false, isWritable: true },
        { pubkey: round.address, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: settleData,
    });

    const settleResult = await sendTx(connection, signer, settleIx, "Settle");
    if (!settleResult.success) {
      console.log(`Settle failed: ${settleResult.error}`);
      return { success: false, error: settleResult.error };
    }
    console.log(`Settled! Sig: ${settleResult.signature.slice(0, 20)}...`);
    handState = 4; // Settled
  } else if (handState === 4) {
    console.log("\n--- STEP 4: SETTLE --- (SKIPPED - already settled)");
  }

  // Step 5: Claim winnings (if any)
  console.log("\n--- STEP 5: CLAIM WINNINGS ---");
  const claimData = Buffer.alloc(1);
  claimData[0] = 41; // ClaimBlackjackWinnings = 41

  const claimIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: handAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: BJ_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: claimData,
  });

  const claimResult = await sendTx(connection, signer, claimIx, "Claim");
  if (claimResult.success) {
    console.log(`Winnings claimed! Sig: ${claimResult.signature.slice(0, 20)}...`);
  } else {
    console.log(`No winnings to claim or claim failed: ${claimResult.error}`);
  }

  console.log("\nBLACKJACK TEST COMPLETED SUCCESSFULLY!");
  return { success: true };
}

async function fundBlackjackHouse(connection, signer, vaultAddress, signerAta, vaultAta) {
  const [gameAddress] = findPDA([Buffer.from("blackjack_game")], ORE_PROGRAM_ID);

  // Ensure vault ATA exists
  await ensureVaultAta(connection, signer, vaultAddress, BJ_MINT);

  const fundAmount = 10000n * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundBlackjackHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: BJ_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const result = await sendTx(connection, signer, fundIx, "Fund blackjack house");
  if (!result.success) {
    throw new Error(`Failed to fund house: ${result.error}`);
  }
  console.log(`House funded! Sig: ${result.signature.slice(0, 20)}...`);
}

// ============================================================================
// BACCARAT TEST
// ============================================================================

async function testBaccarat(connection, signer) {
  console.log("\n" + "=".repeat(60));
  console.log("TESTING BACCARAT");
  console.log("=".repeat(60));

  const [gameAddress] = findPDA([Buffer.from("baccarat_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("baccarat_vault")], ORE_PROGRAM_ID);
  const [positionAddress] = findPDA(
    [Buffer.from("baccarat_position"), signer.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );

  const signerAta = await getAssociatedTokenAddress(CARAT_MINT, signer.publicKey);
  const vaultAta = await getAssociatedTokenAddress(CARAT_MINT, vaultAddress, true);

  console.log(`Game: ${gameAddress.toBase58()}`);
  console.log(`Vault: ${vaultAddress.toBase58()}`);
  console.log(`Position PDA: ${positionAddress.toBase58()}`);
  console.log(`Vault ATA: ${vaultAta.toBase58()}`);

  // Check CARAT balance
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log(`CARAT Balance: ${balance.value.uiAmount} tokens`);
    if (balance.value.uiAmount === 0) {
      console.log("ERROR: No CARAT tokens. Use faucet first.");
      return { success: false, error: "No tokens" };
    }
  } catch (e) {
    console.log("ERROR: Could not check CARAT balance. Use faucet first.");
    return { success: false, error: "No token account" };
  }

  // Check if game is funded and vault ATA exists
  const gameInfo = await connection.getAccountInfo(gameAddress);
  if (!gameInfo) {
    console.log("Baccarat game not funded. Funding house first...");
    await fundBaccaratHouse(connection, signer, gameAddress, vaultAddress, signerAta, vaultAta);
  }

  // Ensure vault ATA exists
  await ensureVaultAta(connection, signer, vaultAddress, CARAT_MINT);

  // Step 1: Place bet (Player bet)
  console.log("\n--- STEP 1: PLACE PLAYER BET ---");
  const betAmount = 1n * ONE_TOKEN;
  // PlaceBaccaratBet: bet_type(1) + _padding(7) + amount(8)
  const betData = Buffer.alloc(17);
  betData[0] = Instructions.PlaceBaccaratBet;
  betData[1] = 0; // BetType::Player = 0
  betData.writeBigUInt64LE(betAmount, 9);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: CARAT_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, signer, betIx, "Place bet");
  if (!betResult.success) {
    console.log(`Bet failed: ${betResult.error}`);
    return { success: false, error: betResult.error };
  }
  console.log(`Bet placed! Sig: ${betResult.signature.slice(0, 20)}...`);

  // Step 2: Settle (auto-deals and settles)
  console.log("\n--- STEP 2: SETTLE BACCARAT ---");
  // SettleBaccarat: discriminator(1) + slot_hash(32)
  const settleData = Buffer.alloc(33);
  settleData[0] = Instructions.SettleBaccarat;
  // Generate a deterministic slot_hash for testing (use current time as entropy)
  const slotHash = Buffer.alloc(32);
  const timestamp = Date.now();
  slotHash.writeBigUInt64LE(BigInt(timestamp), 0);
  slotHash.writeBigUInt64LE(BigInt(timestamp ^ 0xdeadbeef), 8);
  slotHash.writeBigUInt64LE(BigInt(timestamp ^ 0xcafebabe), 16);
  slotHash.writeBigUInt64LE(BigInt(timestamp ^ 0xfeedface), 24);
  settleData.set(slotHash, 1);

  // Account layout: signer, game, [optional positions...]
  const settleIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true }, // Include our position
    ],
    programId: ORE_PROGRAM_ID,
    data: settleData,
  });

  const settleResult = await sendTx(connection, signer, settleIx, "Settle");
  if (!settleResult.success) {
    console.log(`Settle failed: ${settleResult.error}`);
    return { success: false, error: settleResult.error };
  }
  console.log(`Settled! Sig: ${settleResult.signature.slice(0, 20)}...`);

  console.log("\nBACCARAT TEST COMPLETED SUCCESSFULLY!");
  return { success: true };
}

async function fundBaccaratHouse(connection, signer, gameAddress, vaultAddress, signerAta, vaultAta) {
  // First ensure vault ATA exists
  await ensureVaultAta(connection, signer, vaultAddress, CARAT_MINT);

  const fundAmount = 10000n * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundBaccaratHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: CARAT_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const result = await sendTx(connection, signer, fundIx, "Fund baccarat house");
  if (!result.success) {
    throw new Error(`Failed to fund house: ${result.error}`);
  }
  console.log(`House funded! Sig: ${result.signature.slice(0, 20)}...`);
}

// ============================================================================
// ROULETTE TEST
// ============================================================================

async function testRoulette(connection, signer) {
  console.log("\n" + "=".repeat(60));
  console.log("TESTING ROULETTE");
  console.log("=".repeat(60));

  const [gameAddress] = findPDA([Buffer.from("roulette_game")], ORE_PROGRAM_ID);
  const [vaultAddress] = findPDA([Buffer.from("roulette_vault")], ORE_PROGRAM_ID);
  const [positionAddress] = findPDA(
    [Buffer.from("roulette_position"), signer.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );

  const signerAta = await getAssociatedTokenAddress(ROUL_MINT, signer.publicKey);
  const vaultAta = await getAssociatedTokenAddress(ROUL_MINT, vaultAddress, true);

  console.log(`Game: ${gameAddress.toBase58()}`);
  console.log(`Position PDA: ${positionAddress.toBase58()}`);

  // Check ROUL balance
  try {
    const balance = await connection.getTokenAccountBalance(signerAta);
    console.log(`ROUL Balance: ${balance.value.uiAmount} tokens`);
    if (balance.value.uiAmount === 0) {
      console.log("ERROR: No ROUL tokens. Use faucet first.");
      return { success: false, error: "No tokens" };
    }
  } catch (e) {
    console.log("ERROR: Could not check ROUL balance. Use faucet first.");
    return { success: false, error: "No token account" };
  }

  // Check if game is funded
  const gameInfo = await connection.getAccountInfo(gameAddress);
  if (!gameInfo) {
    console.log("Roulette game not funded. Funding house first...");
    await fundRouletteHouse(connection, signer, vaultAddress, signerAta, vaultAta);
  }

  // Find a round for RNG
  const round = await findOrCreateRound(connection, signer);
  if (!round) {
    console.log("ERROR: No round available for RNG.");
    return { success: false, error: "No round for RNG" };
  }

  // Step 1: Place bet (Red bet - type 4)
  console.log("\n--- STEP 1: PLACE RED BET ---");
  const betAmount = 1n * ONE_TOKEN;
  // PlaceRouletteBet: bet_type(1) + position(1) + _padding(6) + amount(8)
  const betData = Buffer.alloc(17);
  betData[0] = Instructions.PlaceRouletteBet;
  betData[1] = 4; // Red bet type
  betData[2] = 0; // Position (not used for color bets)
  betData.writeBigUInt64LE(betAmount, 9);

  const betIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: ROUL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: betData,
  });

  const betResult = await sendTx(connection, signer, betIx, "Place bet");
  if (!betResult.success) {
    console.log(`Bet failed: ${betResult.error}`);
    return { success: false, error: betResult.error };
  }
  console.log(`Bet placed! Sig: ${betResult.signature.slice(0, 20)}...`);

  // Step 2: Settle roulette (with round account and 8-byte round_id)
  console.log("\n--- STEP 2: SETTLE ROULETTE ---");

  // SettleRoulette: discriminator(1) + round_id(8)
  const settleData = Buffer.alloc(9);
  settleData[0] = Instructions.SettleRoulette;
  settleData.writeBigUInt64LE(BigInt(round.id), 1); // 8-byte round_id

  // Account layout: signer, game, position, round
  const settleIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: positionAddress, isSigner: false, isWritable: true },
      { pubkey: round.address, isSigner: false, isWritable: false }, // round at index 3
    ],
    programId: ORE_PROGRAM_ID,
    data: settleData,
  });

  const settleResult = await sendTx(connection, signer, settleIx, "Settle");
  if (!settleResult.success) {
    console.log(`Settle failed: ${settleResult.error}`);
    return { success: false, error: settleResult.error };
  }
  console.log(`Settled! Sig: ${settleResult.signature.slice(0, 20)}...`);

  // Step 3: Claim winnings (if any)
  console.log("\n--- STEP 3: CLAIM WINNINGS ---");

  // Check position for pending winnings
  const positionInfo = await connection.getAccountInfo(positionAddress);
  if (positionInfo) {
    const posData = positionInfo.data;
    // pending_winnings is at offset after other fields - skip to check
    // Just try to claim
    const claimData = Buffer.alloc(1);
    claimData[0] = 46; // ClaimRouletteWinnings

    const claimIx = new TransactionInstruction({
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: gameAddress, isSigner: false, isWritable: true },
        { pubkey: positionAddress, isSigner: false, isWritable: true },
        { pubkey: vaultAddress, isSigner: false, isWritable: false },
        { pubkey: signerAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: ROUL_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: ORE_PROGRAM_ID,
      data: claimData,
    });

    const claimResult = await sendTx(connection, signer, claimIx, "Claim winnings");
    if (claimResult.success) {
      console.log(`Winnings claimed! Sig: ${claimResult.signature.slice(0, 20)}...`);
    } else {
      console.log(`No winnings to claim or claim failed: ${claimResult.error}`);
    }
  }

  console.log("\nROULETTE TEST COMPLETED SUCCESSFULLY!");
  return { success: true };
}

async function fundRouletteHouse(connection, signer, vaultAddress, signerAta, vaultAta) {
  const [gameAddress] = findPDA([Buffer.from("roulette_game")], ORE_PROGRAM_ID);

  // Ensure vault ATA exists
  await ensureVaultAta(connection, signer, vaultAddress, ROUL_MINT);

  const fundAmount = 10000n * ONE_TOKEN;
  const fundData = Buffer.alloc(9);
  fundData[0] = Instructions.FundRouletteHouse;
  fundData.writeBigUInt64LE(fundAmount, 1);

  const fundIx = new TransactionInstruction({
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: gameAddress, isSigner: false, isWritable: true },
      { pubkey: vaultAddress, isSigner: false, isWritable: false },
      { pubkey: signerAta, isSigner: false, isWritable: true },
      { pubkey: vaultAta, isSigner: false, isWritable: true },
      { pubkey: ROUL_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ORE_PROGRAM_ID,
    data: fundData,
  });

  const result = await sendTx(connection, signer, fundIx, "Fund roulette house");
  if (!result.success) {
    throw new Error(`Failed to fund house: ${result.error}`);
  }
  console.log(`House funded! Sig: ${result.signature.slice(0, 20)}...`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("============================================================");
  console.log("DEVNET BLACKJACK, BACCARAT & ROULETTE TEST");
  console.log("============================================================");

  const connection = new Connection(DEVNET_RPC, "confirmed");

  // Load keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log(`\nSigner: ${signer.publicKey.toBase58()}`);

  // Check SOL balance
  const balance = await connection.getBalance(signer.publicKey);
  console.log(`SOL balance: ${balance / 1e9} SOL`);

  const results = {};

  // Run tests
  results.blackjack = await testBlackjack(connection, signer);
  results.baccarat = await testBaccarat(connection, signer);
  results.roulette = await testRoulette(connection, signer);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("TEST SUMMARY");
  console.log("=".repeat(60));

  let allPassed = true;
  for (const [game, result] of Object.entries(results)) {
    const status = result.success ? "SUCCESS" : "FAILED";
    const icon = result.success ? "\u2705" : "\u274C";
    console.log(`${icon} ${game.toUpperCase()}: ${status}${result.error ? ` - ${result.error}` : ""}`);
    if (!result.success) allPassed = false;
  }

  console.log("\n" + "=".repeat(60));
  console.log(allPassed ? "ALL TESTS PASSED!" : "SOME TESTS FAILED");
  console.log("=".repeat(60));

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
