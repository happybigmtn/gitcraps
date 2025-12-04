#!/usr/bin/env node
/**
 * Keeper Bot for OreSociety Mining Rounds
 *
 * This bot automatically:
 * 1. Monitors mining round status
 * 2. Calls Reset when rounds expire to finalize and create next round
 * 3. Calls StartRound to begin new rounds
 * 4. Optionally deploys a small amount to keep the game active
 *
 * Usage:
 *   node keeper-bot.mjs [--deploy] [--interval=30]
 *
 * Options:
 *   --deploy     Also deploy a small bet on sum=7 each round
 *   --interval   Polling interval in seconds (default: 30)
 *   --duration   Round duration in slots (default: 150, ~1 minute)
 */
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  sendAndConfirmTransaction,
  SYSVAR_SLOT_HASHES_PUBKEY
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress
} from "@solana/spl-token";
import fs from "fs";

// Configuration
const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const RNG_MINT = new PublicKey("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
const CRAP_MINT = new PublicKey("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");
const ENTROPY_PROGRAM_ID = new PublicKey("EntropykUXLDfYhdrWNqx9TL8ePGS3Hj5ENDadWFRw1");
const INTERMISSION_SLOTS = 10; // Slots to wait after round ends before reset

// Parse CLI args
const args = process.argv.slice(2);
const shouldDeploy = args.includes("--deploy");
const intervalArg = args.find(a => a.startsWith("--interval="));
const durationArg = args.find(a => a.startsWith("--duration="));
const POLL_INTERVAL = intervalArg ? parseInt(intervalArg.split("=")[1]) * 1000 : 30000;
const ROUND_DURATION = durationArg ? BigInt(durationArg.split("=")[1]) : 150n;

function findPDA(seeds, programId) {
  return PublicKey.findProgramAddressSync(seeds, programId);
}

function toLeBytes(value, size) {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  if (size === 8) {
    view.setBigUint64(0, BigInt(value), true);
  } else if (size === 4) {
    view.setUint32(0, Number(value), true);
  }
  return new Uint8Array(buffer);
}

function squaresToMask(squares) {
  let mask = 0n;
  for (let i = 0; i < 36 && i < squares.length; i++) {
    if (squares[i]) {
      mask |= (1n << BigInt(i));
    }
  }
  return mask;
}

async function loadKeypair() {
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(keypairData));
}

async function getBoardState(connection, boardPda) {
  const boardAccount = await connection.getAccountInfo(boardPda);
  if (!boardAccount) return null;

  const roundId = boardAccount.data.readBigUInt64LE(8);
  const startSlot = boardAccount.data.readBigUInt64LE(16);
  const endSlot = boardAccount.data.readBigUInt64LE(24);

  return { roundId, startSlot, endSlot };
}

async function startRound(connection, signer, boardPda, configPda, roundPda) {
  // StartRound instruction: discriminator(22) + duration(8 bytes)
  const data = Buffer.alloc(9);
  data[0] = 22; // StartRound discriminator
  data.writeBigUInt64LE(ROUND_DURATION, 1);

  const ix = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: boardPda, isSigner: false, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: roundPda, isSigner: false, isWritable: true },
    ],
    data,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = signer.publicKey;

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log(`[${new Date().toISOString()}] StartRound SUCCESS: ${sig}`);
    return true;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] StartRound FAILED: ${e.message}`);
    return false;
  }
}

async function deployBet(connection, signer, boardPda, roundId) {
  // Deploy on sum=7 squares (6 squares)
  const squares = new Array(36).fill(false);
  squares[0*6 + 5] = true; // 1-6
  squares[1*6 + 4] = true; // 2-5
  squares[2*6 + 3] = true; // 3-4
  squares[3*6 + 2] = true; // 4-3
  squares[4*6 + 1] = true; // 5-2
  squares[5*6 + 0] = true; // 6-1

  const amountPerSquare = 100_000_000n; // 0.1 RNG per square
  const mask = squaresToMask(squares);

  const [minerPda] = findPDA([Buffer.from("miner"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);
  const [automationPda] = findPDA([Buffer.from("automation"), signer.publicKey.toBuffer()], ORE_PROGRAM_ID);

  const roundIdBytes = Buffer.alloc(8);
  roundIdBytes.writeBigUInt64LE(roundId);
  const [roundPda] = findPDA([Buffer.from("round"), roundIdBytes], ORE_PROGRAM_ID);

  const entropyIndexBytes = Buffer.alloc(8);
  entropyIndexBytes.writeBigUInt64LE(0n);
  const [entropyVarPda] = findPDA(
    [Buffer.from("var"), boardPda.toBuffer(), entropyIndexBytes],
    ENTROPY_PROGRAM_ID
  );

  const signerRngAta = await getAssociatedTokenAddress(RNG_MINT, signer.publicKey);
  const roundRngAta = await getAssociatedTokenAddress(RNG_MINT, roundPda, true);

  // Deploy instruction data
  const data = new Uint8Array(25);
  data[0] = 6; // Deploy discriminator
  data.set(toLeBytes(amountPerSquare, 8), 1);
  data.set(toLeBytes(mask, 8), 9);
  data[17] = 0; // dice_prediction = 0 (safe mode)

  const deployIx = new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer.publicKey, isSigner: true, isWritable: true },
      { pubkey: signer.publicKey, isSigner: false, isWritable: true },
      { pubkey: automationPda, isSigner: false, isWritable: true },
      { pubkey: boardPda, isSigner: false, isWritable: true },
      { pubkey: minerPda, isSigner: false, isWritable: true },
      { pubkey: roundPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: signerRngAta, isSigner: false, isWritable: true },
      { pubkey: roundRngAta, isSigner: false, isWritable: true },
      { pubkey: RNG_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: entropyVarPda, isSigner: false, isWritable: true },
      { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });

  const tx = new Transaction().add(deployIx);
  tx.feePayer = signer.publicKey;

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [signer], {
      skipPreflight: false,
      commitment: "confirmed"
    });
    console.log(`[${new Date().toISOString()}] Deploy SUCCESS (0.6 RNG on sum=7): ${sig}`);
    return true;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Deploy FAILED: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("ORE SOCIETY KEEPER BOT");
  console.log("=".repeat(60));
  console.log(`Poll interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`Round duration: ${ROUND_DURATION} slots`);
  console.log(`Auto-deploy: ${shouldDeploy}`);
  console.log("");

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const signer = await loadKeypair();

  console.log(`Signer: ${signer.publicKey.toBase58()}`);

  // Get PDAs
  const [boardPda] = findPDA([Buffer.from("board")], ORE_PROGRAM_ID);
  const [configPda] = findPDA([Buffer.from("config")], ORE_PROGRAM_ID);

  console.log(`Board PDA: ${boardPda.toBase58()}`);
  console.log("");

  let lastRoundId = -1n;
  let roundStarted = false;

  async function poll() {
    try {
      const currentSlot = BigInt(await connection.getSlot());
      const board = await getBoardState(connection, boardPda);

      if (!board) {
        console.log(`[${new Date().toISOString()}] Board not initialized`);
        return;
      }

      const { roundId, startSlot, endSlot } = board;
      const roundIdBytes = Buffer.alloc(8);
      roundIdBytes.writeBigUInt64LE(roundId);
      const [roundPda] = findPDA([Buffer.from("round"), roundIdBytes], ORE_PROGRAM_ID);

      const isActive = currentSlot >= startSlot && currentSlot < endSlot;
      const isExpired = endSlot < BigInt("18446744073709551615") && currentSlot >= endSlot;
      const slotsRemaining = isActive ? Number(endSlot - currentSlot) : 0;

      // Log status
      if (roundId !== lastRoundId) {
        console.log(`[${new Date().toISOString()}] Round ${roundId}: slots ${startSlot}-${endSlot}`);
        lastRoundId = roundId;
        roundStarted = false;
      }

      if (isActive) {
        console.log(`[${new Date().toISOString()}] Round ${roundId} ACTIVE - ${slotsRemaining} slots remaining`);

        // Deploy if enabled and haven't deployed this round yet
        if (shouldDeploy && !roundStarted) {
          roundStarted = true;
          await deployBet(connection, signer, boardPda, roundId);
        }
      } else if (isExpired) {
        console.log(`[${new Date().toISOString()}] Round ${roundId} EXPIRED - starting new round...`);

        // Start new round
        const success = await startRound(connection, signer, boardPda, configPda, roundPda);
        if (success) {
          roundStarted = false;
        }
      } else if (endSlot === BigInt("18446744073709551615")) {
        console.log(`[${new Date().toISOString()}] Round ${roundId} WAITING - starting round...`);

        // Round waiting for start
        const success = await startRound(connection, signer, boardPda, configPda, roundPda);
        if (success) {
          roundStarted = false;
        }
      }
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Poll error: ${e.message}`);
    }
  }

  // Initial poll
  await poll();

  // Start polling loop
  console.log(`\nStarting keeper loop (Ctrl+C to stop)...\n`);
  setInterval(poll, POLL_INTERVAL);
}

main().catch(console.error);
