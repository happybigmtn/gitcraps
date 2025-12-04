#!/usr/bin/env node
/**
 * Full Craps Game Test on Devnet
 * 1. Place a bet
 * 2. Get current round
 * 3. Settle bet (devnet skips RNG validation)
 * 4. Claim winnings
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
  getAssociatedTokenAddress
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

// Winning square determines dice roll - square = (die1-1)*6 + (die2-1)
// For dice 7 (pass line natural win on come-out): can be 1+6=7, 2+5=7, etc.
// Square for (1,6): 0*6 + 5 = 5
// Square for (6,1): 5*6 + 0 = 30
// Square for (3,4): 2*6 + 3 = 15
const DICE_OUTCOMES = {
  // Naturals (7 or 11) - Pass line wins on come-out
  seven_3_4: 2*6 + 3, // = 15 (dice 3+4 = 7)
  seven_6_1: 5*6 + 0, // = 30 (dice 6+1 = 7)
  eleven_5_6: 4*6 + 5, // = 29 (dice 5+6 = 11)

  // Craps (2, 3, 12) - Pass line loses on come-out
  two_1_1: 0*6 + 0, // = 0 (dice 1+1 = 2)
  three_1_2: 0*6 + 1, // = 1 (dice 1+2 = 3)
  twelve_6_6: 5*6 + 5, // = 35 (dice 6+6 = 12)

  // Point numbers (4, 5, 6, 8, 9, 10)
  four_2_2: 1*6 + 1, // = 7 (dice 2+2 = 4)
  five_2_3: 1*6 + 2, // = 8 (dice 2+3 = 5)
  six_3_3: 2*6 + 2, // = 14 (dice 3+3 = 6)
  eight_4_4: 3*6 + 3, // = 21 (dice 4+4 = 8)
  nine_4_5: 3*6 + 4, // = 22 (dice 4+5 = 9)
  ten_5_5: 4*6 + 4, // = 28 (dice 5+5 = 10)
};

function squareToDice(square) {
  const die1 = Math.floor(square / 6) + 1;
  const die2 = (square % 6) + 1;
  return [die1, die2, die1 + die2];
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("=".repeat(60));
  console.log("DEVNET CRAPS FULL GAME TEST");
  console.log("=".repeat(60));
  console.log("Signer:", signer.publicKey.toBase58());

  // Get PDAs
  const [crapsGame] = findPDA([Buffer.from("craps_game")], ORE_PROGRAM_ID);
  const [crapsVault] = findPDA([Buffer.from("craps_vault")], ORE_PROGRAM_ID);
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const [positionPda] = findPDA(
    [Buffer.from("craps_position"), signer.publicKey.toBuffer()],
    ORE_PROGRAM_ID
  );

  console.log("Craps Game:", crapsGame.toBase58());
  console.log("Position:", positionPda.toBase58());

  // Get board to find current round
  const boardAccount = await connection.getAccountInfo(boardPda);
  if (!boardAccount) {
    console.log("ERROR: Board not initialized!");
    return;
  }

  const roundId = boardAccount.data.readBigUInt64LE(8);
  console.log("Current round ID:", roundId.toString());

  // Get round PDA
  const roundIdBytes = Buffer.alloc(8);
  roundIdBytes.writeBigUInt64LE(roundId);
  const [roundPda] = findPDA(
    [Buffer.from("round"), roundIdBytes],
    ORE_PROGRAM_ID
  );
  console.log("Round PDA:", roundPda.toBase58());

  // Check game state
  const gameAccount = await connection.getAccountInfo(crapsGame);
  if (!gameAccount) {
    console.log("ERROR: Craps game not initialized!");
    return;
  }

  const gameData = gameAccount.data;
  const epochId = gameData.readBigUInt64LE(8);
  const point = gameData.readUInt8(16);
  const isComeOut = gameData.readUInt8(17) === 1;
  const houseBankroll = gameData.readBigUInt64LE(24);
  console.log(`Game: epoch=${epochId}, point=${point}, isComeOut=${isComeOut}, bankroll=${houseBankroll}`);

  // Get ATAs
  const signerCrapAta = await getAssociatedTokenAddress(CRAP_MINT, signer.publicKey);
  const vaultCrapAta = await getAssociatedTokenAddress(CRAP_MINT, crapsVault, true);

  // Check signer balance
  let balance;
  try {
    const balanceResp = await connection.getTokenAccountBalance(signerCrapAta);
    balance = BigInt(balanceResp.value.amount);
    console.log("CRAP balance:", balanceResp.value.uiAmount);
  } catch (e) {
    console.log("No CRAP balance - need tokens first");
    return;
  }

  // Check position state before bet
  const positionBefore = await connection.getAccountInfo(positionPda);
  let pendingWinningsBefore = 0n;
  if (positionBefore) {
    // pending_winnings is at offset 40 (8 discriminator + 32 authority)
    pendingWinningsBefore = positionBefore.data.readBigUInt64LE(40);
    console.log("Pending winnings before:", pendingWinningsBefore.toString());
  }

  // ========== STEP 1: PLACE BET ==========
  console.log("\n--- STEP 1: PLACE BET ---");

  const betType = 0; // PassLine
  const pointVal = 0;
  const betAmount = BigInt(1_000_000_000); // 1 CRAP

  const placeBetData = Buffer.alloc(17);
  placeBetData[0] = 23; // PlaceCrapsBet
  placeBetData[1] = betType;
  placeBetData[2] = pointVal;
  placeBetData.writeBigUInt64LE(betAmount, 9);

  // Updated account layout for session support:
  // 0: signer (delegate OR authority)
  // 1: authority - the user who owns the position
  // 2: craps_game
  // 3: craps_position
  // 4: craps_vault
  // 5: authority_crap_ata
  // 6: vault_crap_ata
  // 7: crap_mint
  // 8: system_program
  // 9: token_program
  // 10: associated_token_program
  // 11: [optional] session
  const placeBetIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },  // signer
      { pubkey: signer.publicKey, isSigner: false, isWritable: false }, // authority (same as signer for direct calls)
      { pubkey: crapsGame, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: crapsVault, isSigner: false, isWritable: false },
      { pubkey: signerCrapAta, isSigner: false, isWritable: true },
      { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
      { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: placeBetData,
  });

  const placeBetTx = new Transaction().add(placeBetIx);
  placeBetTx.feePayer = signer.publicKey;

  try {
    console.log("Placing PassLine bet for 1 CRAP...");
    const sig = await sendAndConfirmTransaction(connection, placeBetTx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log("Bet placed! Sig:", sig);
  } catch (e) {
    console.log("Place bet failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    return;
  }

  // ========== STEP 2: SETTLE BET ==========
  console.log("\n--- STEP 2: SETTLE BET ---");

  // Choose a winning square - if come-out, roll a 7 to win pass line
  // If point phase, need to roll the point to win
  let winningSquare;
  if (isComeOut || point === 0) {
    // Come-out phase: roll a 7 to win pass line
    winningSquare = DICE_OUTCOMES.seven_3_4;
    console.log("Come-out phase: Rolling 7 (Pass Line wins)");
  } else {
    // Point phase: roll the point to win
    switch (point) {
      case 4: winningSquare = DICE_OUTCOMES.four_2_2; break;
      case 5: winningSquare = DICE_OUTCOMES.five_2_3; break;
      case 6: winningSquare = DICE_OUTCOMES.six_3_3; break;
      case 8: winningSquare = DICE_OUTCOMES.eight_4_4; break;
      case 9: winningSquare = DICE_OUTCOMES.nine_4_5; break;
      case 10: winningSquare = DICE_OUTCOMES.ten_5_5; break;
      default:
        winningSquare = DICE_OUTCOMES.seven_3_4;
    }
    console.log(`Point phase: Rolling ${point} to hit point (Pass Line wins)`);
  }

  const [die1, die2, diceSum] = squareToDice(winningSquare);
  console.log(`Dice: ${die1} + ${die2} = ${diceSum}, Square: ${winningSquare}`);

  // SettleCraps: discriminator(24) + winning_square(8 bytes)
  const settleData = Buffer.alloc(9);
  settleData[0] = 24; // SettleCraps
  settleData.writeBigUInt64LE(BigInt(winningSquare), 1);

  const settleIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: crapsGame, isSigner: false, isWritable: true },
      { pubkey: positionPda, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: false },
    ],
    data: settleData,
  });

  const settleTx = new Transaction().add(settleIx);
  settleTx.feePayer = signer.publicKey;

  try {
    console.log("Settling bet...");
    const simulation = await connection.simulateTransaction(settleTx, [signer]);

    if (simulation.value.err) {
      console.log("Settle simulation failed:", JSON.stringify(simulation.value.err));
      simulation.value.logs?.forEach(log => console.log("  ", log));
      return;
    }

    console.log("Simulation passed:");
    simulation.value.logs?.forEach(log => console.log("  ", log));

    const sig = await sendAndConfirmTransaction(connection, settleTx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log("Settled! Sig:", sig);
  } catch (e) {
    console.log("Settle failed:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    return;
  }

  // Check position after settle
  const positionAfterSettle = await connection.getAccountInfo(positionPda);
  let pendingWinningsAfterSettle = 0n;
  if (positionAfterSettle) {
    pendingWinningsAfterSettle = positionAfterSettle.data.readBigUInt64LE(40);
    console.log("Pending winnings after settle:", pendingWinningsAfterSettle.toString());
  }

  // ========== STEP 3: CLAIM WINNINGS ==========
  if (pendingWinningsAfterSettle > 0n) {
    console.log("\n--- STEP 3: CLAIM WINNINGS ---");

    // ClaimCrapsWinnings: discriminator(25)
    const claimData = Buffer.alloc(1);
    claimData[0] = 25;

    const claimIx = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: crapsGame, isSigner: false, isWritable: true },
        { pubkey: positionPda, isSigner: false, isWritable: true },
        { pubkey: crapsVault, isSigner: false, isWritable: false },
        { pubkey: vaultCrapAta, isSigner: false, isWritable: true },
        { pubkey: signerCrapAta, isSigner: false, isWritable: true },
        { pubkey: CRAP_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: claimData,
    });

    const claimTx = new Transaction().add(claimIx);
    claimTx.feePayer = signer.publicKey;

    try {
      console.log("Claiming winnings...");
      const sig = await sendAndConfirmTransaction(connection, claimTx, [signer], {
        skipPreflight: false,
        commitment: "confirmed"
      });
      console.log("Claimed! Sig:", sig);
    } catch (e) {
      console.log("Claim failed:", e.message);
      if (e.logs) e.logs.forEach(log => console.log("  ", log));
    }
  } else {
    console.log("\n--- STEP 3: CLAIM WINNINGS ---");
    console.log("No pending winnings to claim");
  }

  // ========== FINAL STATE ==========
  console.log("\n--- FINAL STATE ---");

  const finalBalance = await connection.getTokenAccountBalance(signerCrapAta);
  console.log("Final CRAP balance:", finalBalance.value.uiAmount);
  console.log("Balance change:", (BigInt(finalBalance.value.amount) - balance).toString());

  const positionFinal = await connection.getAccountInfo(positionPda);
  if (positionFinal) {
    const pendingWinningsFinal = positionFinal.data.readBigUInt64LE(40);
    console.log("Pending winnings:", pendingWinningsFinal.toString());
  }

  console.log("\n" + "=".repeat(60));
  console.log("TEST COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
