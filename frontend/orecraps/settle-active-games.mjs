#!/usr/bin/env node
/**
 * Settle all active casino game positions on Devnet
 * This script will complete any pending game flow and settle the positions
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import fs from "fs";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

const MINTS = {
  WAR: new PublicKey("HMhL9yb5zZ7v6WmQ79NzYj5ebbeX4TN2NUkcuFFFMusz"),
  TCP: new PublicKey("3UTs2U6ps5z1asibwgtCZAtbatuKGcqX85QJ7zZBvvth"),
  VPK: new PublicKey("GNPiaDCr18GZ4PKcHDEFuAXkisBpN2aosBruqNAdXT2W"),
};

const SLOT_HASHES_SYSVAR = new PublicKey("SysvarS1otHashes111111111111111111111111111");

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

async function settleWar(connection, signer) {
  console.log("\n=== SETTLING WAR ===");

  const [warGame] = findPDA([Buffer.from("war_game")], ORE_PROGRAM_ID);
  const [warPosition] = findPDA([Buffer.from("war_position"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);
  const [warVault] = findPDA([Buffer.from("war_vault")], ORE_PROGRAM_ID);

  const signerAta = await getAssociatedTokenAddress(MINTS.WAR, signer.publicKey);
  const vaultAta = await getAssociatedTokenAddress(MINTS.WAR, warVault, true);

  // Check position state
  const positionAccount = await connection.getAccountInfo(warPosition);
  if (!positionAccount) {
    console.log("No War position found");
    return;
  }

  // WarPosition state is at offset 56 (8+32+8+8)
  const positionState = positionAccount.data[56];
  // pending_winnings is at offset 88
  const pendingWinnings = positionAccount.data.readBigUInt64LE(88);
  console.log(`War position state: ${positionState}, pending winnings: ${pendingWinnings}`);

  // If state is 3 (Settled) with pending winnings, claim first
  if (positionState === 3 && pendingWinnings > 0) {
    console.log("Claiming War winnings...");
    const claimData = Buffer.alloc(1);
    claimData[0] = 52; // ClaimWarWinnings

    const claimIx = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: warGame, isSigner: false, isWritable: true },
        { pubkey: warPosition, isSigner: false, isWritable: true },
        { pubkey: warVault, isSigner: false, isWritable: false },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: signerAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data: claimData,
    });

    try {
      const tx = new Transaction().add(claimIx);
      const simulation = await connection.simulateTransaction(tx, [signer]);
      console.log("ClaimWarWinnings simulation logs:");
      simulation.value.logs?.forEach(log => console.log("  ", log));

      if (!simulation.value.err) {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        console.log("ClaimWarWinnings SUCCESS:", sig);
        console.log("Position should now be reset to state 0");
        return;
      } else {
        console.log("ClaimWarWinnings simulation failed:", JSON.stringify(simulation.value.err));
      }
    } catch (e) {
      console.log("ClaimWarWinnings error:", e.message);
      if (e.logs) e.logs.forEach(log => console.log("  ", log));
    }
    return;
  }

  // Get board for round ID
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const boardAccount = await connection.getAccountInfo(boardPda);
  const roundId = boardAccount.data.readBigUInt64LE(8);

  if (positionState === 0) {
    // State 0 = ante placed, need to DealWar
    console.log("Dealing War cards...");

    const data = Buffer.alloc(9);
    data[0] = 49; // DealWar
    data.writeBigUInt64LE(roundId, 1);

    const ix = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: warGame, isSigner: false, isWritable: true },
        { pubkey: warPosition, isSigner: false, isWritable: true },
        { pubkey: warVault, isSigner: false, isWritable: false },
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: signerAta, isSigner: false, isWritable: true },
        { pubkey: SLOT_HASHES_SYSVAR, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      data,
    });

    try {
      const tx = new Transaction().add(ix);
      const simulation = await connection.simulateTransaction(tx, [signer]);
      console.log("Simulation logs:");
      simulation.value.logs?.forEach(log => console.log("  ", log));

      if (!simulation.value.err) {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        console.log("DealWar SUCCESS:", sig);

        // Check new state - might need surrender if tie
        await new Promise(resolve => setTimeout(resolve, 1000));
        const updatedPosition = await connection.getAccountInfo(warPosition);
        const newState = updatedPosition.data[48];
        console.log("New state after deal:", newState);

        if (newState === 1) {
          // Tie - need to surrender
          console.log("Tie detected - surrendering...");
          await surrenderWar(connection, signer, warGame, warPosition);
        }
      } else {
        console.log("DealWar simulation failed:", JSON.stringify(simulation.value.err));
      }
    } catch (e) {
      console.log("DealWar error:", e.message);
      if (e.logs) e.logs.forEach(log => console.log("  ", log));
    }
  } else if (positionState === 1) {
    // State 1 = dealt with tie, need surrender
    console.log("Position in dealt state (tie) - surrendering...");
    await surrenderWar(connection, signer, warGame, warPosition);
  } else if (positionState === 3) {
    console.log("War position already settled");
  } else {
    console.log("Unknown War state:", positionState);
  }
}

async function surrenderWar(connection, signer, warGame, warPosition) {
  const data = Buffer.alloc(1);
  data[0] = 51; // Surrender

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: warGame, isSigner: false, isWritable: true },
      { pubkey: warPosition, isSigner: false, isWritable: true },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
    console.log("Surrender SUCCESS:", sig);
  } catch (e) {
    console.log("Surrender error:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
  }
}

async function settleTCP(connection, signer) {
  console.log("\n=== SETTLING THREE CARD POKER ===");

  const [tcpGame] = findPDA([Buffer.from("threecard_game")], ORE_PROGRAM_ID);
  const [tcpPosition] = findPDA([Buffer.from("threecard_position"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);

  // Check position state
  const positionAccount = await connection.getAccountInfo(tcpPosition);
  if (!positionAccount) {
    console.log("No TCP position found");
    return;
  }

  // ThreeCardPosition state offset - need to find it
  // Based on struct: authority(32) + ante(8) + pair_plus(8) + state(1) = offset 48
  const positionState = positionAccount.data[48];
  console.log(`TCP position state: ${positionState}`);
  // TCP States: 0=None, 1=Betting (with bets), 2=Dealt, 3=Settled

  // Get board for round ID
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const boardAccount = await connection.getAccountInfo(boardPda);
  const roundId = boardAccount.data.readBigUInt64LE(8);

  if (positionState === 0) {
    console.log("TCP position is None (no active bets)");
    return;
  } else if (positionState === 1) {
    // State 1 = Betting with active bets, need to DealThreeCard first
    console.log("Dealing Three Card Poker...");

    const data = Buffer.alloc(9);
    data[0] = 59; // DealThreeCard
    data.writeBigUInt64LE(roundId, 1);

    const ix = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: tcpGame, isSigner: false, isWritable: true },
        { pubkey: tcpPosition, isSigner: false, isWritable: true },
        { pubkey: SLOT_HASHES_SYSVAR, isSigner: false, isWritable: false },
      ],
      data,
    });

    try {
      const tx = new Transaction().add(ix);
      const simulation = await connection.simulateTransaction(tx, [signer]);
      console.log("Simulation logs:");
      simulation.value.logs?.forEach(log => console.log("  ", log));

      if (!simulation.value.err) {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        console.log("DealThreeCard SUCCESS:", sig);

        // Now fold to settle
        await new Promise(resolve => setTimeout(resolve, 1000));
        await foldTCP(connection, signer, tcpGame, tcpPosition);
      } else {
        console.log("DealThreeCard simulation failed:", JSON.stringify(simulation.value.err));
      }
    } catch (e) {
      console.log("DealThreeCard error:", e.message);
      if (e.logs) e.logs.forEach(log => console.log("  ", log));
    }
  } else if (positionState === 2) {
    // State 2 = Dealt, need to fold
    console.log("Position dealt - folding...");
    await foldTCP(connection, signer, tcpGame, tcpPosition);
  } else if (positionState === 3) {
    console.log("TCP position already settled");
  } else {
    console.log("Unknown TCP state:", positionState);
  }
}

async function foldTCP(connection, signer, tcpGame, tcpPosition) {
  const data = Buffer.alloc(1);
  data[0] = 61; // FoldThreeCard

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: tcpGame, isSigner: false, isWritable: true },
      { pubkey: tcpPosition, isSigner: false, isWritable: true },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
    console.log("FoldThreeCard SUCCESS:", sig);
  } catch (e) {
    console.log("FoldThreeCard error:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
  }
}

async function settleVPK(connection, signer) {
  console.log("\n=== SETTLING VIDEO POKER ===");

  const [vpkGame] = findPDA([Buffer.from("video_poker_game")], ORE_PROGRAM_ID);
  const [vpkPosition] = findPDA([Buffer.from("video_poker_position"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);

  // Get round PDA
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const boardAccount = await connection.getAccountInfo(boardPda);
  const roundId = boardAccount.data.readBigUInt64LE(8);
  const roundIdBytes = Buffer.alloc(8);
  roundIdBytes.writeBigUInt64LE(roundId);
  const [roundPda] = findPDA([Buffer.from("round"), roundIdBytes], ORE_PROGRAM_ID);

  // Check position state
  const positionAccount = await connection.getAccountInfo(vpkPosition);
  if (!positionAccount) {
    console.log("No VPK position found");
    return;
  }

  // Try HoldAndDraw first (state 2 - Dealt)
  console.log("Trying HoldAndDraw (for state 2 - Dealt)...");
  const holdResult = await holdAndDrawVPK(connection, signer, vpkGame, vpkPosition, roundPda);

  if (!holdResult) {
    // If HoldAndDraw failed, try DealVideoPoker (state 1 - Betting)
    console.log("Trying DealVideoPoker (for state 1 - Betting)...");
    const data = Buffer.alloc(1);
    data[0] = 65; // DealVideoPoker

    const ix = new TransactionInstruction({
      programId: ORE_PROGRAM_ID,
      keys: [
        { pubkey: signer.publicKey, isSigner: true, isWritable: true },
        { pubkey: vpkPosition, isSigner: false, isWritable: true },
        { pubkey: roundPda, isSigner: false, isWritable: false },
      ],
      data,
    });

    try {
      const tx = new Transaction().add(ix);
      const simulation = await connection.simulateTransaction(tx, [signer]);
      console.log("Simulation logs:");
      simulation.value.logs?.forEach(log => console.log("  ", log));

      if (!simulation.value.err) {
        const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
        console.log("DealVideoPoker SUCCESS:", sig);

        // Now hold & draw to settle (hold all cards)
        await new Promise(resolve => setTimeout(resolve, 1000));
        await holdAndDrawVPK(connection, signer, vpkGame, vpkPosition, roundPda);
      } else {
        console.log("DealVideoPoker simulation failed:", JSON.stringify(simulation.value.err));
        // Check if already settled
        const stateMatch = simulation.value.logs?.find(log => log.includes("position state is"));
        if (stateMatch && stateMatch.includes("4")) {
          console.log("VPK position already settled (state 4)");
        }
      }
    } catch (e) {
      console.log("DealVideoPoker error:", e.message);
      if (e.logs) e.logs.forEach(log => console.log("  ", log));
    }
  }
}

async function holdAndDrawVPK(connection, signer, vpkGame, vpkPosition, roundPda) {
  // HoldAndDraw with held_mask = 0b11111 (hold all cards)
  // Struct: held_mask(1) + _padding(7) = 8 bytes
  const data = Buffer.alloc(9);
  data[0] = 66; // HoldAndDraw
  data[1] = 0b11111; // Hold all 5 cards
  // bytes 2-8 are padding (already 0)

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: vpkGame, isSigner: false, isWritable: true },
      { pubkey: vpkPosition, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: false },
    ],
    data,
  });

  try {
    const tx = new Transaction().add(ix);
    const simulation = await connection.simulateTransaction(tx, [signer]);
    console.log("HoldAndDraw simulation logs:");
    simulation.value.logs?.forEach(log => console.log("  ", log));

    if (simulation.value.err) {
      console.log("HoldAndDraw simulation failed:", JSON.stringify(simulation.value.err));
      return false;
    }

    const sig = await sendAndConfirmTransaction(connection, tx, [signer]);
    console.log("HoldAndDraw SUCCESS:", sig);
    return true;
  } catch (e) {
    console.log("HoldAndDraw error:", e.message);
    if (e.logs) e.logs.forEach(log => console.log("  ", log));
    return false;
  }
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");

  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const signer = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  console.log("============================================================");
  console.log("SETTLE ALL ACTIVE CASINO GAMES ON DEVNET");
  console.log("============================================================");
  console.log("Signer:", signer.publicKey.toBase58());

  await settleWar(connection, signer);
  await settleTCP(connection, signer);
  await settleVPK(connection, signer);

  console.log("\n============================================================");
  console.log("SETTLEMENT COMPLETE");
  console.log("============================================================");
}

main().catch(console.error);
