#!/usr/bin/env node
import { createSolanaRpc, address, getProgramDerivedAddress } from "@solana/kit";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = address("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function toLeBytes(n, len) {
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = Number((n >> BigInt(8 * i)) & 0xffn);
  }
  return arr;
}

async function roundPDA(roundId) {
  const idBytes = toLeBytes(roundId, 8);
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("round"), idBytes],
  });
}

async function crapsGamePDA() {
  return getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ID,
    seeds: [new TextEncoder().encode("craps_game")],
  });
}

async function main() {
  const rpc = createSolanaRpc(LOCALNET_RPC);

  console.log("============================================================");
  console.log("CHECKING ROUND AND CRAPS GAME STATE");
  console.log("============================================================");

  // Check Round 0
  const [round0Address] = await roundPDA(0n);
  console.log("\nRound 0 PDA:", round0Address);

  const { value: round0Account } = await rpc.getAccountInfo(round0Address, { encoding: "base64" }).send();
  if (round0Account) {
    const data = Buffer.from(round0Account.data[0], "base64");
    console.log("Round 0 data length:", data.length);
    console.log("Round 0 owner:", round0Account.owner);

    // Parse Round structure (need to know the layout)
    // Typical: discriminator(1), id(8), start_slot(8), end_slot(8), slots(8*36)...
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
  const [crapsGameAddress] = await crapsGamePDA();
  console.log("\n\nCrapsGame PDA:", crapsGameAddress);

  const { value: crapsGameAccount } = await rpc.getAccountInfo(crapsGameAddress, { encoding: "base64" }).send();
  if (crapsGameAccount) {
    const data = Buffer.from(crapsGameAccount.data[0], "base64");
    console.log("CrapsGame data length:", data.length);

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
  const slot = await rpc.getSlot().send();
  console.log("\n\nCurrent slot:", slot);
}

main().catch(console.error);
