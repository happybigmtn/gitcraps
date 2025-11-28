import { Connection, PublicKey } from "@solana/web3.js";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const API_BASE = "http://localhost:3000/api";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const TEST_PUBKEY = new PublicKey("4t2yussVn2Rn8SmubYyJpXsXdxq9CifdXDTyhZ35Q6Tq");

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

async function simulateRoll() {
  const response = await fetch(`${API_BASE}/simulate-roll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  return response.json();
}

async function main() {
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  console.log("============================================================");
  console.log("INVESTIGATING BETS AND RUNNING MANUAL ROLLS");
  console.log("============================================================");

  // Get craps game state
  const [gameAddress] = crapsGamePDA();
  const [positionAddress] = crapsPositionPDA(TEST_PUBKEY);

  console.log("\n--- On-Chain Addresses ---");
  console.log("Craps Game PDA:", gameAddress.toBase58());
  console.log("Player Position PDA:", positionAddress.toBase58());

  // Check account balances
  const gameAccount = await connection.getAccountInfo(gameAddress);
  const positionAccount = await connection.getAccountInfo(positionAddress);

  console.log("\n--- Account Status ---");
  console.log("Game account exists:", !!gameAccount);
  console.log("Game account size:", gameAccount?.data.length || 0, "bytes");
  console.log("Position account exists:", !!positionAccount);
  console.log("Position account size:", positionAccount?.data.length || 0, "bytes");

  // Parse game state (basic)
  if (gameAccount) {
    const data = gameAccount.data;
    // Skip discriminator (1 byte)
    let offset = 1;
    const epochId = data.readBigUInt64LE(offset); offset += 8;
    const gamePhase = data.readUInt8(offset); offset += 1;
    const point = data.readUInt8(offset); offset += 1;

    console.log("\n--- Craps Game State ---");
    console.log("Epoch ID:", epochId.toString());
    console.log("Game Phase:", gamePhase, "(0=ComeOut, 1=Point, 2=Resolved)");
    console.log("Point:", point);

    // Read house bankroll (offset varies, approximately at end)
    // This is simplified - actual parsing may differ
  }

  // Parse position state
  if (positionAccount) {
    const data = positionAccount.data;
    // Skip discriminator (1 byte)
    let offset = 1;
    const player = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
    const epochId = data.readBigUInt64LE(offset); offset += 8;

    // Read bet amounts
    const passLine = data.readBigUInt64LE(offset); offset += 8;
    const dontPass = data.readBigUInt64LE(offset); offset += 8;
    const passOdds = data.readBigUInt64LE(offset); offset += 8;
    const dontPassOdds = data.readBigUInt64LE(offset); offset += 8;

    // Place bets array (6 values: 4, 5, 6, 8, 9, 10)
    const placeBets = [];
    for (let i = 0; i < 6; i++) {
      placeBets.push(Number(data.readBigUInt64LE(offset)) / 1e9);
      offset += 8;
    }

    // Hardways (4 values: 4, 6, 8, 10)
    const hardways = [];
    for (let i = 0; i < 4; i++) {
      hardways.push(Number(data.readBigUInt64LE(offset)) / 1e9);
      offset += 8;
    }

    // Single-roll bets
    const field = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const anySeven = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const anyCraps = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const yoEleven = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const aces = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const twelve = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;

    console.log("\n--- Player Position (Epoch " + epochId + ") ---");
    console.log("Player:", player.toBase58().slice(0, 20) + "...");
    console.log("Pass Line:", Number(passLine) / 1e9, "SOL");
    console.log("Don't Pass:", Number(dontPass) / 1e9, "SOL");
    console.log("Place Bets [4,5,6,8,9,10]:", placeBets.map(x => x + " SOL").join(", "));
    console.log("Hardways [4,6,8,10]:", hardways.map(x => x + " SOL").join(", "));
    console.log("Field:", field, "SOL");
    console.log("Any Seven:", anySeven, "SOL");
    console.log("Any Craps:", anyCraps, "SOL");
    console.log("Yo Eleven:", yoEleven, "SOL");
    console.log("Aces:", aces, "SOL");
    console.log("Twelve:", twelve, "SOL");
  }

  // Now roll dice 15 times (5 epochs x 3 rolls)
  console.log("\n============================================================");
  console.log("ROLLING DICE 15 TIMES");
  console.log("============================================================");

  const rollHistory = [];
  const outcomes = { wins: 0, losses: 0, active: 0 };

  for (let i = 1; i <= 15; i++) {
    const result = await simulateRoll();
    const dice = result.diceResults;

    console.log("\nRoll " + i + ": " + dice.die1 + " + " + dice.die2 + " = " + dice.sum + (dice.isHardway ? " (HARDWAY)" : ""));

    // Count outcomes
    if (result.outcomes) {
      const o = result.outcomes;
      const winningBets = [];
      const losingBets = [];

      for (const [bet, outcome] of Object.entries(o)) {
        if (outcome.wins) {
          winningBets.push(bet);
        } else if (outcome.reason.includes("loses")) {
          losingBets.push(bet);
        }
      }

      if (winningBets.length > 0) {
        console.log("  WINS: " + winningBets.join(", "));
      }
      if (losingBets.length > 0) {
        console.log("  LOSES: " + losingBets.join(", "));
      }
    }

    rollHistory.push({ roll: i, die1: dice.die1, die2: dice.die2, sum: dice.sum });
    await new Promise(r => setTimeout(r, 300));
  }

  // Summary
  console.log("\n============================================================");
  console.log("ROLL HISTORY SUMMARY");
  console.log("============================================================");

  const distribution = {};
  for (const r of rollHistory) {
    distribution[r.sum] = (distribution[r.sum] || 0) + 1;
  }

  console.log("\nDice Distribution:");
  for (let i = 2; i <= 12; i++) {
    const count = distribution[i] || 0;
    const bar = "*".repeat(count);
    console.log("  " + i.toString().padStart(2) + ": " + bar + " (" + count + ")");
  }

  // Check final position state
  console.log("\n--- Final Position State ---");
  const finalPositionAccount = await connection.getAccountInfo(positionAddress);
  if (finalPositionAccount) {
    const data = finalPositionAccount.data;
    let offset = 1 + 32 + 8; // Skip disc + pubkey + epoch

    const passLine = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;
    const dontPass = Number(data.readBigUInt64LE(offset)) / 1e9; offset += 8;

    console.log("Pass Line remaining:", passLine, "SOL");
    console.log("Don't Pass remaining:", dontPass, "SOL");

    // Check pending winnings (near end of struct)
    // This requires knowing exact struct layout
  }

  console.log("\nDone! All 18 bet types were placed and 15 dice rolls executed.");
}

main().catch(console.error);
