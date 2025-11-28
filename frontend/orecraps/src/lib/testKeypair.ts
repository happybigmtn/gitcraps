import { Keypair } from "@solana/web3.js";

export function loadTestKeypair(): Keypair {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Test keypairs not allowed in production");
  }

  const seedString = process.env.TEST_KEYPAIR_SEED;
  if (!seedString) {
    throw new Error("TEST_KEYPAIR_SEED environment variable not set");
  }

  const seed = Buffer.from(seedString, "base64");
  if (seed.length !== 32) {
    throw new Error("TEST_KEYPAIR_SEED must be 32 bytes (base64 encoded)");
  }

  return Keypair.fromSeed(seed);
}
