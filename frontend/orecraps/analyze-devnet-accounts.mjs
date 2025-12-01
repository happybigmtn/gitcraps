#!/usr/bin/env node
/**
 * Analyze devnet account data in detail to find struct layout mismatches
 */
import { Connection, PublicKey } from "@solana/web3.js";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");

function getBoardPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("board")], ORE_PROGRAM_ID);
}

function getConfigPDA() {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], ORE_PROGRAM_ID);
}

function getRoundPDA(roundId) {
  const buffer = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number((roundId >> BigInt(8 * i)) & 0xffn);
  }
  return PublicKey.findProgramAddressSync([Buffer.from("round"), buffer], ORE_PROGRAM_ID);
}

async function main() {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  
  const [boardAddress] = getBoardPDA();
  const [configAddress] = getConfigPDA();
  const [roundAddress] = getRoundPDA(0n);
  
  console.log("=== DEVNET ACCOUNT ANALYSIS ===\n");
  
  // Board account
  console.log("BOARD ACCOUNT:", boardAddress.toBase58());
  const boardInfo = await connection.getAccountInfo(boardAddress);
  if (boardInfo) {
    const data = boardInfo.data;
    console.log("  Owner:", boardInfo.owner.toBase58());
    console.log("  Length:", data.length, "bytes");
    console.log("  Raw hex:", data.toString("hex"));
    console.log("\n  Steel expects Board struct:");
    console.log("    - discriminator: 8 bytes (first byte should be 105 for Board)");
    console.log("    - round_id: u64 (8 bytes LE)");
    console.log("    - start_slot: u64 (8 bytes LE)");
    console.log("    - end_slot: u64 (8 bytes LE)");
    console.log("    Total expected: 32 bytes");
    console.log("\n  Parsing Board data:");
    // Steel discriminator is 8 bytes, first byte is the enum value
    const discriminator = data.slice(0, 8);
    console.log("    discriminator[0]:", discriminator[0], "(expect 105 for Board)");
    console.log("    discriminator hex:", discriminator.toString("hex"));
    if (data.length >= 32) {
      const roundId = data.readBigUInt64LE(8);
      const startSlot = data.readBigUInt64LE(16);
      const endSlot = data.readBigUInt64LE(24);
      console.log("    round_id:", roundId.toString());
      console.log("    start_slot:", startSlot.toString());
      console.log("    end_slot:", endSlot.toString());
    }
  } else {
    console.log("  NOT FOUND");
  }
  
  // Config account
  console.log("\n\nCONFIG ACCOUNT:", configAddress.toBase58());
  const configInfo = await connection.getAccountInfo(configAddress);
  if (configInfo) {
    const data = configInfo.data;
    console.log("  Owner:", configInfo.owner.toBase58());
    console.log("  Length:", data.length, "bytes");
    console.log("  First 64 bytes hex:", data.slice(0, 64).toString("hex"));
    console.log("\n  Steel expects Config struct:");
    console.log("    - discriminator: 8 bytes (first byte should be 101 for Config)");
    console.log("    - admin: Pubkey (32 bytes)");
    console.log("    - bury_authority: Pubkey (32 bytes)");
    console.log("    - fee_collector: Pubkey (32 bytes)");
    console.log("    - swap_program: Pubkey (32 bytes)");
    console.log("    - var_address: Pubkey (32 bytes)");
    console.log("    - admin_fee: u64 (8 bytes)");
    console.log("    Total expected: 8 + 32*5 + 8 = 176 bytes");
    console.log("\n  Parsing Config data:");
    const discriminator = data.slice(0, 8);
    console.log("    discriminator[0]:", discriminator[0], "(expect 101 for Config)");
    console.log("    discriminator hex:", discriminator.toString("hex"));
    if (data.length >= 40) {
      const admin = new PublicKey(data.slice(8, 40));
      console.log("    admin:", admin.toBase58());
    }
    if (data.length >= 72) {
      const buryAuthority = new PublicKey(data.slice(40, 72));
      console.log("    bury_authority:", buryAuthority.toBase58());
    }
    if (data.length >= 104) {
      const feeCollector = new PublicKey(data.slice(72, 104));
      console.log("    fee_collector:", feeCollector.toBase58());
    }
    if (data.length >= 136) {
      const swapProgram = new PublicKey(data.slice(104, 136));
      console.log("    swap_program:", swapProgram.toBase58());
    }
    if (data.length >= 168) {
      const varAddress = new PublicKey(data.slice(136, 168));
      console.log("    var_address:", varAddress.toBase58());
    }
    if (data.length >= 176) {
      const adminFee = data.readBigUInt64LE(168);
      console.log("    admin_fee:", adminFee.toString());
    }
  } else {
    console.log("  NOT FOUND");
  }
  
  // Round account
  console.log("\n\nROUND ACCOUNT:", roundAddress.toBase58());
  const roundInfo = await connection.getAccountInfo(roundAddress);
  if (roundInfo) {
    const data = roundInfo.data;
    console.log("  Owner:", roundInfo.owner.toBase58());
    console.log("  Length:", data.length, "bytes");
    console.log("  First 64 bytes hex:", data.slice(0, 64).toString("hex"));
    console.log("\n  Steel expects Round struct:");
    console.log("    - discriminator: 8 bytes (first byte should be 109 for Round)");
    console.log("    - id: u64 (8 bytes)");
    console.log("    - creator: Pubkey (32 bytes)");
    console.log("    - winning_square: u8 (1 byte + 7 padding?)");
    console.log("    - dice_results: (u8, u8) (2 bytes + 6 padding?)");
    console.log("    - total_rng: u64 (8 bytes)");
    console.log("    Total should be 736 bytes");
    console.log("\n  Parsing Round data:");
    const discriminator = data.slice(0, 8);
    console.log("    discriminator[0]:", discriminator[0], "(expect 109 for Round)");
    console.log("    discriminator hex:", discriminator.toString("hex"));
    if (data.length >= 16) {
      const id = data.readBigUInt64LE(8);
      console.log("    id:", id.toString());
    }
    if (data.length >= 48) {
      const creator = new PublicKey(data.slice(16, 48));
      console.log("    creator:", creator.toBase58());
    }
  } else {
    console.log("  NOT FOUND");
  }
  
  // Check if accounts are owned by the program
  console.log("\n\n=== OWNERSHIP CHECK ===");
  console.log("Expected owner:", ORE_PROGRAM_ID.toBase58());
  if (boardInfo) console.log("Board owner match:", boardInfo.owner.equals(ORE_PROGRAM_ID));
  if (configInfo) console.log("Config owner match:", configInfo.owner.equals(ORE_PROGRAM_ID));
  if (roundInfo) console.log("Round owner match:", roundInfo.owner.equals(ORE_PROGRAM_ID));
}

main().catch(console.error);
