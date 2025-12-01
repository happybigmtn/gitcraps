import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  address,
  getProgramDerivedAddress,
  getAddressEncoder,
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
  getBase58Decoder,
} from "@solana/kit";
import fs from "fs";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const LOCALNET_RPC_WS = "ws://127.0.0.1:8900";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const TEST_PUBKEY = address("4t2yussVn2Rn8SmubYyJpXsXdxq9CifdXDTyhZ35Q6Tq");

// PDAs
async function crapsGamePDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_game")],
  });
}

async function crapsPositionPDA(player) {
  const addressEncoder = getAddressEncoder();
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_position"), addressEncoder.encode(player)],
  });
}

async function roundPDA(roundId) {
  const buf = toLeBytes(roundId, 8);
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("round"), buf],
  });
}

async function boardPDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("board")],
  });
}

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

// Create SettleCraps instruction
async function createSettleCrapsInstruction(signer, winningSquare, roundId) {
  const [crapsGameAddress] = await crapsGamePDA();
  const [crapsPositionAddress] = await crapsPositionPDA(signer.address);
  const [roundAddress] = await roundPDA(roundId);

  // Build instruction data: [discriminator (1 byte)] [winning_square (8 bytes)]
  const data = new Uint8Array(9);
  data[0] = 24; // SettleCraps discriminator
  data.set(toLeBytes(BigInt(winningSquare), 8), 1);

  return {
    programAddress: ORE_PROGRAM_ID,
    accounts: [
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: crapsGameAddress, role: AccountRole.WRITABLE },
      { address: crapsPositionAddress, role: AccountRole.WRITABLE },
      { address: roundAddress, role: AccountRole.READONLY },
    ],
    data,
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
  const rpc = createSolanaRpc(LOCALNET_RPC);
  const rpcSubscriptions = createSolanaRpcSubscriptions(LOCALNET_RPC_WS);
  const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

  // Load keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const keypair = await createKeyPairSignerFromBytes(Uint8Array.from(keypairData));

  // Also load the test keypair used for bets (from base64 seed)
  const testSeed = Buffer.from("XqqclpkdKvsk/ED+Ghq4OUfZ0Bzqm2PDJrQDuTg+N8g=", "base64");
  // Create a full 64-byte keypair from the 32-byte seed (seed + derived pubkey)
  const { createKeyPairFromBytes } = await import("@solana/keys");
  // For a seed-based keypair, we need to derive the full keypair
  // Using createKeyPairSignerFromBytes expects a 64-byte array
  // Let's create a deterministic keypair from the seed
  const crypto = await import("crypto");
  const testKeypairBytes = new Uint8Array(64);
  testKeypairBytes.set(testSeed, 0);
  // Derive public key bytes (simplified - in reality would need ed25519 derivation)
  // For this test, we'll just use the admin keypair to test settlement
  const testKeypair = keypair; // Use admin keypair for now

  console.log("============================================================");
  console.log("SETTLE CRAPS BETS AND INVESTIGATE");
  console.log("============================================================");
  console.log("Admin keypair:", keypair.address);

  // Get current board state
  const [boardAddress] = await boardPDA();
  const { value: boardAccount } = await rpc.getAccountInfo(boardAddress, { encoding: "base64" }).send();

  if (!boardAccount) {
    console.log("ERROR: Board not initialized");
    return;
  }

  // Parse round_id from board (at offset 16)
  const boardData = Buffer.from(boardAccount.data[0], "base64");
  const roundId = boardData.readBigUInt64LE(16);
  console.log("\nCurrent Round ID:", roundId.toString());

  // Check if round account exists
  const [roundAddress] = await roundPDA(roundId);
  const { value: roundAccount } = await rpc.getAccountInfo(roundAddress, { encoding: "base64" }).send();
  console.log("Round PDA:", roundAddress);
  console.log("Round account exists:", !!roundAccount);

  // Also check round 0
  const [round0Address] = await roundPDA(0n);
  const { value: round0Account } = await rpc.getAccountInfo(round0Address, { encoding: "base64" }).send();
  console.log("Round 0 PDA:", round0Address);
  console.log("Round 0 exists:", !!round0Account);

  // Get position before settlement
  const [positionAddress] = await crapsPositionPDA(testKeypair.address);
  const { value: positionBefore } = await rpc.getAccountInfo(positionAddress, { encoding: "base64" }).send();

  if (positionBefore) {
    console.log("\n--- Position BEFORE Settlement ---");
    const data = Buffer.from(positionBefore.data[0], "base64");
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
    const settleIx = await createSettleCrapsInstruction(
      testKeypair,
      roll.winningSquare,
      0n  // Use round 0
    );

    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

    const tx = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(testKeypair, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(settleIx, m),
    );

    try {
      const signedTx = await signTransactionMessageWithSigners(tx);
      const sig = getSignatureFromTransaction(signedTx);
      await sendAndConfirmTransaction(signedTx, { commitment: "confirmed" });
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
  const { value: positionAfter } = await rpc.getAccountInfo(positionAddress, { encoding: "base64" }).send();

  if (positionAfter) {
    console.log("\n--- Position AFTER Settlement ---");
    const data = Buffer.from(positionAfter.data[0], "base64");
    let offset = 1 + 32 + 8;

    const passLine = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const dontPass = Number(data.readBigUInt64LE(offset)) / 1e9;

    console.log("Pass Line:", passLine, "SOL");
    console.log("Don't Pass:", dontPass, "SOL");
  }

  // Check test keypair balance
  const { value: balance } = await rpc.getBalance(testKeypair.address).send();
  console.log("\nTest keypair balance:", Number(balance) / 1e9, "SOL");

  console.log("\n============================================================");
  console.log("DONE");
  console.log("============================================================");
}

main().catch(console.error);
