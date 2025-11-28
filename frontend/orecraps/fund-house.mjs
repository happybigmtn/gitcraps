import { Connection, Keypair, Transaction, SystemProgram, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
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

// Create FundHouse instruction
// instruction discriminator 26 = FundCrapsHouse
function createFundHouseInstruction(signer, crapsGameAddress, amount) {
  const data = new Uint8Array(9);
  data[0] = 26; // FundCrapsHouse discriminator
  data.set(toLeBytes(BigInt(amount), 8), 1);

  return {
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: crapsGameAddress, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  };
}

async function main() {
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  // Load admin keypair
  const keypairPath = "/home/r/.config/solana/id.json";
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
  const admin = Keypair.fromSecretKey(Uint8Array.from(keypairData));

  const [crapsGameAddress] = crapsGamePDA();

  console.log("============================================================");
  console.log("FUNDING CRAPS HOUSE");
  console.log("============================================================");
  console.log("Admin:", admin.publicKey.toBase58());
  console.log("CrapsGame PDA:", crapsGameAddress.toBase58());

  // Check if CrapsGame exists
  const crapsGameAccount = await connection.getAccountInfo(crapsGameAddress);
  if (!crapsGameAccount) {
    console.log("\nCrapsGame account does not exist. Creating via first bet...");
    // The craps game is initialized on first bet placement
  } else {
    console.log("\nCrapsGame account exists, data length:", crapsGameAccount.data.length);
  }

  // Fund the house with 50 SOL
  const amount = 50 * LAMPORTS_PER_SOL;
  console.log("\nFunding house with 50 SOL...");

  const fundIx = createFundHouseInstruction(admin.publicKey, crapsGameAddress, amount);
  const transaction = new Transaction().add(fundIx);
  transaction.feePayer = admin.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  try {
    transaction.sign(admin);
    const sig = await connection.sendRawTransaction(transaction.serialize());
    await connection.confirmTransaction(sig, "confirmed");
    console.log("  Funded! Sig:", sig.slice(0, 30) + "...");
  } catch (e) {
    console.log("  Error:", e.message?.slice(0, 200) || e.toString());
  }

  // Check house balance after
  const crapsGameAfter = await connection.getAccountInfo(crapsGameAddress);
  if (crapsGameAfter) {
    console.log("\nCrapsGame account balance:", crapsGameAfter.lamports / LAMPORTS_PER_SOL, "SOL");

    // Parse house_bankroll from account data
    // CrapsGame layout: disc(1) + epoch_id(8) + game_phase(1) + point(1) + come_points(6) +
    //                   house_bankroll(8) + reserved(8) + total_bet(8)
    const data = crapsGameAfter.data;
    const houseBankroll = Number(data.readBigUInt64LE(17)) / LAMPORTS_PER_SOL;
    console.log("House bankroll:", houseBankroll, "SOL");
  }

  console.log("\n============================================================");
  console.log("DONE");
  console.log("============================================================");
}

main().catch(console.error);
