import { Connection, PublicKey } from "@solana/web3.js";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function roundPDA(roundId) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(roundId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buf],
    ORE_PROGRAM_ID
  );
}

function crapsGamePDA() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("craps_game")],
    ORE_PROGRAM_ID
  );
}

async function main() {
  const connection = new Connection(LOCALNET_RPC, "confirmed");

  console.log("============================================================");
  console.log("CHECKING ROUND AND CRAPS GAME STATE");
  console.log("============================================================");

  // Check Round 0
  const [round0Address] = roundPDA(0n);
  console.log("\nRound 0 PDA:", round0Address.toBase58());

  const round0Account = await connection.getAccountInfo(round0Address);
  if (round0Account) {
    console.log("Round 0 data length:", round0Account.data.length);
    console.log("Round 0 owner:", round0Account.owner.toBase58());

    // Parse Round structure (need to know the layout)
    // Typical: discriminator(1), id(8), start_slot(8), end_slot(8), slots(8*36)...
    const data = round0Account.data;
    console.log("\nRound 0 raw data (first 100 bytes):");
    console.log(data.slice(0, 100).toString('hex'));

    // Try to parse basic fields
    if (data.length > 25) {
      let offset = 1; // Skip discriminator
      const id = data.readBigUInt64LE(offset); offset += 8;
      const startSlot = data.readBigUInt64LE(offset); offset += 8;
      const endSlot = data.readBigUInt64LE(offset); offset += 8;

      console.log("\nParsed Round 0:");
      console.log("  ID:", id.toString());
      console.log("  Start slot:", startSlot.toString());
      console.log("  End slot:", endSlot.toString());
    }
  } else {
    console.log("Round 0 does not exist!");
  }

  // Check CrapsGame
  const [crapsGameAddress] = crapsGamePDA();
  console.log("\n\nCrapsGame PDA:", crapsGameAddress.toBase58());

  const crapsGameAccount = await connection.getAccountInfo(crapsGameAddress);
  if (crapsGameAccount) {
    console.log("CrapsGame data length:", crapsGameAccount.data.length);

    const data = crapsGameAccount.data;
    console.log("\nCrapsGame raw data (first 64 bytes):");
    console.log(data.slice(0, 64).toString('hex'));

    // Parse CrapsGame structure
    // epoch_id(8), game_phase(1), point(1), come_point(6), house_bankroll(8), reserved(8), total_bet(8), ...
    let offset = 1; // Skip discriminator
    const epochId = data.readBigUInt64LE(offset); offset += 8;
    const gamePhase = data.readUInt8(offset); offset += 1;
    const point = data.readUInt8(offset); offset += 1;

    console.log("\nParsed CrapsGame:");
    console.log("  Epoch ID:", epochId.toString());
    console.log("  Game Phase:", gamePhase, "(0=ComeOut, 1=Point, 2=Resolved)");
    console.log("  Point:", point);
  }

  // Check current slot
  const slot = await connection.getSlot();
  console.log("\n\nCurrent slot:", slot);
}

main().catch(console.error);
