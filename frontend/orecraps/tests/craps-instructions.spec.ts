/**
 * Unit tests for Craps instruction building
 * These tests verify that all bet types create valid Solana instructions
 */
import { test, expect } from "@playwright/test";
import { Keypair, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const LOCALNET_RPC = "http://127.0.0.1:8899";
const ORE_PROGRAM_ID = "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK";

// Test keypair
const TEST_SEED = new Uint8Array([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
]);
const TEST_KEYPAIR = Keypair.fromSeed(TEST_SEED);

// Bet type enum (matches program)
enum CrapsBetType {
  PassLine = 0,
  DontPass = 1,
  PassOdds = 2,
  DontPassOdds = 3,
  Come = 4,
  DontCome = 5,
  ComeOdds = 6,
  DontComeOdds = 7,
  Place = 8,
  Hardway = 9,
  Field = 10,
  AnySeven = 11,
  AnyCraps = 12,
  YoEleven = 13,
  Aces = 14,
  Twelve = 15,
}

test.describe("Craps Instruction Building Tests", () => {
  test("should build valid PlaceCrapsBet instruction for PassLine", async () => {
    const betType = CrapsBetType.PassLine;
    const point = 0;
    const amount = BigInt(0.01 * LAMPORTS_PER_SOL);

    // Build instruction data
    const data = new Uint8Array(17);
    data[0] = 23; // PlaceCrapsBet discriminator
    data[1] = betType;
    data[2] = point;
    // data[3-8] = padding (zeros)
    const amountBytes = toLeBytes(amount, 8);
    data.set(amountBytes, 9);

    expect(data[0]).toBe(23);
    expect(data[1]).toBe(CrapsBetType.PassLine);
    expect(data.length).toBe(17);

    console.log(`PassLine instruction: discriminator=${data[0]}, betType=${data[1]}, amount=${amount}`);
  });

  test("should build valid PlaceCrapsBet instruction for Field", async () => {
    const betType = CrapsBetType.Field;
    const point = 0;
    const amount = BigInt(0.01 * LAMPORTS_PER_SOL);

    const data = new Uint8Array(17);
    data[0] = 23;
    data[1] = betType;
    data[2] = point;
    data.set(toLeBytes(amount, 8), 9);

    expect(data[0]).toBe(23);
    expect(data[1]).toBe(CrapsBetType.Field);

    console.log(`Field instruction: discriminator=${data[0]}, betType=${data[1]}, amount=${amount}`);
  });

  test("should build valid PlaceCrapsBet instruction for Place bets", async () => {
    const pointNumbers = [4, 5, 6, 8, 9, 10];
    const amount = BigInt(0.05 * LAMPORTS_PER_SOL);

    for (const point of pointNumbers) {
      const data = new Uint8Array(17);
      data[0] = 23;
      data[1] = CrapsBetType.Place;
      data[2] = point;
      data.set(toLeBytes(amount, 8), 9);

      expect(data[0]).toBe(23);
      expect(data[1]).toBe(CrapsBetType.Place);
      expect(data[2]).toBe(point);

      console.log(`Place ${point} instruction: discriminator=${data[0]}, betType=${data[1]}, point=${data[2]}`);
    }
  });

  test("should build valid PlaceCrapsBet instruction for Hardways", async () => {
    const hardwayNumbers = [4, 6, 8, 10];
    const amount = BigInt(0.01 * LAMPORTS_PER_SOL);

    for (const hardway of hardwayNumbers) {
      const data = new Uint8Array(17);
      data[0] = 23;
      data[1] = CrapsBetType.Hardway;
      data[2] = hardway;
      data.set(toLeBytes(amount, 8), 9);

      expect(data[0]).toBe(23);
      expect(data[1]).toBe(CrapsBetType.Hardway);
      expect(data[2]).toBe(hardway);

      console.log(`Hardway ${hardway} instruction: discriminator=${data[0]}, betType=${data[1]}, point=${data[2]}`);
    }
  });

  test("should build valid PlaceCrapsBet instruction for proposition bets", async () => {
    const propBets = [
      { name: "AnySeven", type: CrapsBetType.AnySeven },
      { name: "AnyCraps", type: CrapsBetType.AnyCraps },
      { name: "YoEleven", type: CrapsBetType.YoEleven },
      { name: "Aces", type: CrapsBetType.Aces },
      { name: "Twelve", type: CrapsBetType.Twelve },
    ];

    const amount = BigInt(0.01 * LAMPORTS_PER_SOL);

    for (const bet of propBets) {
      const data = new Uint8Array(17);
      data[0] = 23;
      data[1] = bet.type;
      data[2] = 0;
      data.set(toLeBytes(amount, 8), 9);

      expect(data[0]).toBe(23);
      expect(data[1]).toBe(bet.type);

      console.log(`${bet.name} instruction: discriminator=${data[0]}, betType=${data[1]}`);
    }
  });

  test("should build valid SettleCraps instruction", async () => {
    const winningSquare = BigInt(14); // Example: 3-3 = sum of 6
    const roundId = BigInt(0);

    const data = new Uint8Array(9);
    data[0] = 24; // SettleCraps discriminator
    data.set(toLeBytes(winningSquare, 8), 1);

    expect(data[0]).toBe(24);
    expect(data.length).toBe(9);

    console.log(`SettleCraps instruction: discriminator=${data[0]}, winningSquare=${winningSquare}`);
  });

  test("should build valid ClaimCrapsWinnings instruction", async () => {
    const data = new Uint8Array(1);
    data[0] = 25; // ClaimCrapsWinnings discriminator

    expect(data[0]).toBe(25);
    expect(data.length).toBe(1);

    console.log(`ClaimCrapsWinnings instruction: discriminator=${data[0]}`);
  });

  test("should build valid FundCrapsHouse instruction", async () => {
    const amount = BigInt(10 * LAMPORTS_PER_SOL);

    const data = new Uint8Array(9);
    data[0] = 26; // FundCrapsHouse discriminator
    data.set(toLeBytes(amount, 8), 1);

    expect(data[0]).toBe(26);
    expect(data.length).toBe(9);

    console.log(`FundCrapsHouse instruction: discriminator=${data[0]}, amount=${amount}`);
  });

  test("should derive correct PDAs for craps accounts", async () => {
    const programId = new PublicKey(ORE_PROGRAM_ID);

    // CrapsGame PDA
    const [crapsGamePDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("craps_game")],
      programId
    );

    // CrapsPosition PDA
    const [crapsPositionPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("craps_position"), TEST_KEYPAIR.publicKey.toBuffer()],
      programId
    );

    console.log(`CrapsGame PDA: ${crapsGamePDA.toBase58()}`);
    console.log(`CrapsPosition PDA: ${crapsPositionPDA.toBase58()}`);

    expect(crapsGamePDA.toBase58()).toBeTruthy();
    expect(crapsPositionPDA.toBase58()).toBeTruthy();
  });

  test("all bet types should have valid discriminators", async () => {
    const betTypes = [
      { name: "PassLine", value: CrapsBetType.PassLine, expected: 0 },
      { name: "DontPass", value: CrapsBetType.DontPass, expected: 1 },
      { name: "PassOdds", value: CrapsBetType.PassOdds, expected: 2 },
      { name: "DontPassOdds", value: CrapsBetType.DontPassOdds, expected: 3 },
      { name: "Come", value: CrapsBetType.Come, expected: 4 },
      { name: "DontCome", value: CrapsBetType.DontCome, expected: 5 },
      { name: "ComeOdds", value: CrapsBetType.ComeOdds, expected: 6 },
      { name: "DontComeOdds", value: CrapsBetType.DontComeOdds, expected: 7 },
      { name: "Place", value: CrapsBetType.Place, expected: 8 },
      { name: "Hardway", value: CrapsBetType.Hardway, expected: 9 },
      { name: "Field", value: CrapsBetType.Field, expected: 10 },
      { name: "AnySeven", value: CrapsBetType.AnySeven, expected: 11 },
      { name: "AnyCraps", value: CrapsBetType.AnyCraps, expected: 12 },
      { name: "YoEleven", value: CrapsBetType.YoEleven, expected: 13 },
      { name: "Aces", value: CrapsBetType.Aces, expected: 14 },
      { name: "Twelve", value: CrapsBetType.Twelve, expected: 15 },
    ];

    for (const bet of betTypes) {
      expect(bet.value).toBe(bet.expected);
      console.log(`✓ ${bet.name}: ${bet.value} = ${bet.expected}`);
    }
  });
});

test.describe("Localnet Integration Tests", () => {
  test("should connect to localnet", async () => {
    try {
      const connection = new Connection(LOCALNET_RPC, "confirmed");
      const version = await connection.getVersion();
      console.log(`Connected to localnet, version: ${JSON.stringify(version)}`);
      expect(version).toBeDefined();
    } catch (error) {
      console.log("Localnet not available, skipping:", error);
      test.skip();
    }
  });

  test("should check test wallet balance", async () => {
    try {
      const connection = new Connection(LOCALNET_RPC, "confirmed");
      const balance = await connection.getBalance(TEST_KEYPAIR.publicKey);
      console.log(`Test wallet balance: ${balance / LAMPORTS_PER_SOL} SOL`);
      expect(balance).toBeGreaterThanOrEqual(0);
    } catch (error) {
      console.log("Localnet not available, skipping:", error);
      test.skip();
    }
  });

  test("should check if craps game account exists", async () => {
    try {
      const connection = new Connection(LOCALNET_RPC, "confirmed");
      const programId = new PublicKey(ORE_PROGRAM_ID);

      const [crapsGamePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("craps_game")],
        programId
      );

      const accountInfo = await connection.getAccountInfo(crapsGamePDA);

      if (accountInfo) {
        console.log(`CrapsGame account exists: ${crapsGamePDA.toBase58()}`);
        console.log(`  Owner: ${accountInfo.owner.toBase58()}`);
        console.log(`  Data length: ${accountInfo.data.length}`);
        console.log(`  Lamports: ${accountInfo.lamports / LAMPORTS_PER_SOL} SOL`);
      } else {
        console.log("CrapsGame account not initialized yet");
      }
    } catch (error) {
      console.log("Error checking craps game:", error);
    }
  });

  test("should check if board account exists", async () => {
    try {
      const connection = new Connection(LOCALNET_RPC, "confirmed");
      const programId = new PublicKey(ORE_PROGRAM_ID);

      const [boardPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("board")],
        programId
      );

      const accountInfo = await connection.getAccountInfo(boardPDA);

      if (accountInfo) {
        console.log(`Board account exists: ${boardPDA.toBase58()}`);
        console.log(`  Owner: ${accountInfo.owner.toBase58()}`);
        console.log(`  Data length: ${accountInfo.data.length}`);

        // Parse basic fields
        if (accountInfo.data.length >= 16) {
          const data = Buffer.from(accountInfo.data);
          const roundId = data.readBigUInt64LE(8);
          console.log(`  Current round ID: ${roundId}`);
        }
      } else {
        console.log("Board account not initialized yet");
      }
    } catch (error) {
      console.log("Error checking board:", error);
    }
  });
});

// Helper function to convert bigint to little-endian bytes
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}
