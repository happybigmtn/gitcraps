import { Connection, Keypair, Transaction, PublicKey } from "@solana/web3.js";
import fs from "fs";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const TEST_PUBKEY = new PublicKey("4t2yussVn2Rn8SmubYyJpXsXdxq9CifdXDTyhZ35Q6Tq");

// PDAs
function crapsGamePDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
    ORE_PROGRAM_ID
  );
}

function crapsPositionPDA(player) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_position"), player.toBuffer()],
    ORE_PROGRAM_ID
  );
}

function roundPDA(roundId) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buf],
    ORE_PROGRAM_ID
  );
}

function boardPDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("board")],
    ORE_PROGRAM_ID
  );
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

// Create SettleCraps instruction
function createSettleCrapsInstruction(signer, winningSquare, roundId) {
  const [crapsGameAddress] = crapsGamePDA();
  const [crapsPositionAddress] = crapsPositionPDA(signer);
  const [roundAddress] = roundPDA(roundId);

  // Build instruction data: [discriminator (1 byte)] [winning_square (8 bytes)]
  const data = new Uint8Array(9);
  data[0] = 24; // SettleCraps discriminator
  data.set(toLeBytes(BigInt(winningSquare), 8), 1);

  return {
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: crapsPositionAddress, isSigner: false, isWritable: true },
      { pubkey: roundAddress, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  };
}

// Generate random dice and calculate winning square
function rollDice() {
  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const sum = die1 + die2;
  // Winning square calculation: (die1-1)*6 + (die2-1)
  const winningSquare = (die1 - 1) * 6 + (die2 - 1);
  return { die1, die2, sum, winningSquare };
}

async function main() {
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  // Load keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  // Also load the test keypair used for bets
  const testSeed = Buffer.from("XqqclpkdKvsk/ED+Ghq4OUfZ0Bzqm2PDJrQDuTg+N8g=", "base64");
  const testKeypair = Keypair.fromSeed(testSeed);

  console.log("============================================================");
  console.log("SETTLE CRAPS BETS AND INVESTIGATE");
  console.log("============================================================");
  console.log("Admin keypair:", keypair.publicKey.toBase58());
  console.log("Test keypair:", testKeypair.publicKey.toBase58());

  // Get current board state
  const [boardAddress] = boardPDA();
  const boardAccount = await connection.getAccountInfo(boardAddress);

  if (!boardAccount) {
    console.log("ERROR: Board not initialized");
    return;
  }

  // Parse round_id from board (at offset 16)
  const roundId = boardAccount.data.readBigUInt64LE(16);
  console.log("\nCurrent Round ID:", roundId.toString());

  // Check if round account exists
  const [roundAddress] = roundPDA(roundId);
  const roundAccount = await connection.getAccountInfo(roundAddress);
  console.log("Round PDA:", roundAddress.toBase58());
  console.log("Round account exists:", !!roundAccount);

  // Also check round 0
  const [round0Address] = roundPDA(0n);
  const round0Account = await connection.getAccountInfo(round0Address);
  console.log("Round 0 PDA:", round0Address.toBase58());
  console.log("Round 0 exists:", !!round0Account);

  // Get position before settlement
  const [positionAddress] = crapsPositionPDA(testKeypair.publicKey);
  const positionBefore = await connection.getAccountInfo(positionAddress);

  if (positionBefore) {
    console.log("\n--- Position BEFORE Settlement ---");
    const data = positionBefore.data;
    let offset = 1 + 32 + 8; // Skip disc + pubkey + epoch

    const passLine = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const dontPass = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    offset += 16; // Skip odds

    // Place bets
    const placeBets = [];
    for (let i = 0; i < 6; i++) {
      placeBets.push(Number(data.readBigUInt64LE(offset)) / 1e9);
      offset += 8;
    }

    // Hardways
    const hardways = [];
    for (let i = 0; i < 4; i++) {
      hardways.push(Number(data.readBigUInt64LE(offset)) / 1e9);
      offset += 8;
    }

    console.log("Pass Line:", passLine, "SOL");
    console.log("Don't Pass:", dontPass, "SOL");
    console.log("Place bets:", placeBets.join(", "));
    console.log("Hardways:", hardways.join(", "));
  }

  // Roll dice and settle for 5 epochs
  console.log("\n============================================================");
  console.log("SETTLING 5 EPOCHS");
  console.log("============================================================");

  for (let epoch = 1; epoch <= 5; epoch++) {
    console.log("\n--- Epoch " + epoch + " ---");

    // Generate random roll
    const roll = rollDice();
    console.log("Roll: " + roll.die1 + " + " + roll.die2 + " = " + roll.sum + " (square: " + roll.winningSquare + ")");

    // Create settle instruction - use round 0 since that's what was initialized
    const settleIx = createSettleCrapsInstruction(
      testKeypair.publicKey,
      roll.winningSquare,
      0n  // Use round 0
    );

    const transaction = new Transaction().add(settleIx);
    transaction.feePayer = testKeypair.publicKey;
    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    try {
      transaction.sign(testKeypair);
      const sig = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(sig, "confirmed");
      console.log("  Settled! Sig: " + sig.slice(0, 30) + "...");
    } catch (e) {
      const errorMsg = e.message || e.toString();
      if (errorMsg.includes("logs")) {
        // Parse simulation error logs
        const logsMatch = errorMsg.match(/Logs:\s*\[([\s\S]*?)\]/);
        if (logsMatch) {
          console.log("  Settlement logs:");
          const logs = logsMatch[1].split(",").map(l => l.trim().replace(/"/g, ""));
          for (const log of logs) {
            if (log.includes("Program log:")) {
              console.log("    " + log);
            }
          }
        }
      }
      console.log("  Settlement result: " + (errorMsg.slice(0, 100)));
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Get position after settlement
  const positionAfter = await connection.getAccountInfo(positionAddress);

  if (positionAfter) {
    console.log("\n--- Position AFTER Settlement ---");
    const data = positionAfter.data;
    let offset = 1 + 32 + 8;

    const passLine = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const dontPass = Number(data.readBigUInt64LE(offset)) / 1e9;

    console.log("Pass Line:", passLine, "SOL");
    console.log("Don't Pass:", dontPass, "SOL");
  }

  // Check test keypair balance
  const balance = await connection.getBalance(testKeypair.publicKey);
  console.log("\nTest keypair balance:", balance / 1e9, "SOL");

  console.log("\n============================================================");
  console.log("DONE");
  console.log("============================================================");
}

main().catch(console.error);
