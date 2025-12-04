/**
 * Solana Core Utilities - Migrated to Anza Kit
 *
 * This module provides core Solana utilities using the new @solana/kit APIs.
 * Legacy web3.js compatibility is maintained via @solana/compat for gradual migration.
 */

import {
  address,
  type Address,
  getProgramDerivedAddress,
  createSolanaRpc,
  type Rpc,
} from "@solana/kit";
import { fromLegacyPublicKey } from "@solana/compat";
import { PublicKey, Connection, clusterApiUrl, TransactionInstruction } from "@solana/web3.js";

// ============================================================================
// PROGRAM IDs - Kit Address Type
// ============================================================================

// Program IDs using Kit Address type
export const ORE_PROGRAM_ADDRESS: Address = address(
  "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"
);

// Legacy alias for backwards compatibility
export const ORE_PROGRAM_ID = new PublicKey(
  "JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK"
);

// ============================================================================
// TOKEN MINTS - Kit Address Type
// ============================================================================

// Network type (defined early for mint address selection)
export type Network = "devnet" | "mainnet-beta" | "localnet";

// Localnet mint addresses (vanity addresses)
const LOCALNET_RNG_MINT = "RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump";
const LOCALNET_CRAP_MINT = "CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump";

// Devnet mint addresses (created via spl-token create-token)
const DEVNET_RNG_MINT = "8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs";
const DEVNET_CRAP_MINT = "7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf";

// Network detection helper
function getNetworkFromEnv(): Network {
  return (process.env.NEXT_PUBLIC_SOLANA_NETWORK as Network) || "localnet";
}

// Get the correct mint address based on network
function getRngMintForNetwork(network?: Network): string {
  const net = network || getNetworkFromEnv();
  return net === "devnet" ? DEVNET_RNG_MINT : LOCALNET_RNG_MINT;
}

function getCrapMintForNetwork(network?: Network): string {
  const net = network || getNetworkFromEnv();
  return net === "devnet" ? DEVNET_CRAP_MINT : LOCALNET_CRAP_MINT;
}

// Token mints using Kit Address type - these are dynamic based on network
export const RNG_MINT_ADDRESS: Address = address(getRngMintForNetwork());
export const CRAP_MINT_ADDRESS: Address = address(getCrapMintForNetwork());

// Legacy aliases for backwards compatibility
export const RNG_MINT = new PublicKey(getRngMintForNetwork());
export const CRAP_MINT = new PublicKey(getCrapMintForNetwork());

// Export getters for dynamic network switching
export function getRngMint(network?: Network): PublicKey {
  return new PublicKey(getRngMintForNetwork(network));
}

export function getCrapMint(network?: Network): PublicKey {
  return new PublicKey(getCrapMintForNetwork(network));
}

export function getRngMintAddress(network?: Network): Address {
  return address(getRngMintForNetwork(network));
}

export function getCrapMintAddress(network?: Network): Address {
  return address(getCrapMintForNetwork(network));
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Token decimals
export const TOKEN_DECIMALS = 11;
export const ONE_ORE = 100_000_000_000n; // 10^11

// RNG/CRAP decimals (devnet)
export const RNG_DECIMALS = 9;
export const CRAP_DECIMALS = 9;
export const ONE_RNG = 1_000_000_000n; // 10^9
export const ONE_CRAP = 1_000_000_000n; // 10^9

// ============================================================================
// CASINO GAME TOKENS - All use CRAP_MINT as placeholder until game-specific tokens are created
// Each game will have its own token for betting and rewards
// ============================================================================

// Token decimal constant for all game tokens (same as RNG/CRAP)
export const ONE_TOKEN = ONE_CRAP; // 10^9 base units

// Game-specific token aliases - currently all point to CRAP for simplicity
// These can be updated to point to different mints when game-specific tokens are created
export const CARAT_MINT = CRAP_MINT;  // Baccarat token
export const BJ_MINT = CRAP_MINT;     // Blackjack token
export const ROUL_MINT = CRAP_MINT;   // Roulette token
export const WAR_MINT = CRAP_MINT;    // Casino War token
export const SICO_MINT = CRAP_MINT;   // Sic Bo token
export const TCP_MINT = CRAP_MINT;    // Three Card Poker token
export const VPK_MINT = CRAP_MINT;    // Video Poker token
export const UTH_MINT = CRAP_MINT;    // Ultimate Texas Hold'em token

// Convenience aliases using ONE_TOKEN for game token amounts
export const ONE_CARAT = ONE_TOKEN;
export const ONE_BJ = ONE_TOKEN;
export const ONE_ROUL = ONE_TOKEN;
export const ONE_WAR = ONE_TOKEN;
export const ONE_SICO = ONE_TOKEN;
export const ONE_TCP = ONE_TOKEN;
export const ONE_VPK = ONE_TOKEN;
export const ONE_UTH = ONE_TOKEN;

// Getters for game-specific tokens (currently all return CRAP mint)
export function getCaratMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getBjMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getRoulMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getWarMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getSicoMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getTcpMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getVpkMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

export function getUthMint(network?: Network): PublicKey {
  return getCrapMint(network);
}

// Slot timing
export const SLOT_DURATION_MS = 400; // ~0.4 seconds per slot

// ============================================================================
// PDA DERIVATIONS - Using Kit APIs
// ============================================================================

/**
 * Convert bigint to little-endian Uint8Array for PDA seeds
 */
function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

/**
 * Get Board PDA using Kit
 */
export async function getBoardPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("board")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Round PDA using Kit
 */
export async function getRoundPDA(roundId: bigint): Promise<{ pda: Address; bump: number }> {
  const seeds = [
    new TextEncoder().encode("round"),
    toLeBytes(roundId, 8),
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Miner PDA using Kit
 */
export async function getMinerPDA(authority: Address): Promise<{ pda: Address; bump: number }> {
  // For Kit Address, we need the raw bytes (32 bytes from base58)
  const authorityBytes = new TextEncoder().encode(authority);
  const seeds = [
    new TextEncoder().encode("miner"),
    authorityBytes,
  ];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Treasury PDA using Kit
 */
export async function getTreasuryPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("treasury")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

/**
 * Get Config PDA using Kit
 */
export async function getConfigPDA(): Promise<{ pda: Address; bump: number }> {
  const seeds = [new TextEncoder().encode("config")];
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: ORE_PROGRAM_ADDRESS,
    seeds,
  });
  return { pda, bump };
}

// ============================================================================
// LEGACY PDA FUNCTIONS - For backwards compatibility
// ============================================================================

export function boardPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("board")],
    ORE_PROGRAM_ID
  );
}

export function roundPDA(roundId: bigint): [PublicKey, number] {
  const buffer = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buffer[i] = Number((roundId >> BigInt(8 * i)) & 0xffn);
  }
  return PublicKey.findProgramAddressSync(
    [Buffer.from("round"), buffer],
    ORE_PROGRAM_ID
  );
}

export function minerPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("miner"), authority.toBuffer()],
    ORE_PROGRAM_ID
  );
}

export function treasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    ORE_PROGRAM_ID
  );
}

export function configPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    ORE_PROGRAM_ID
  );
}

// ============================================================================
// RPC / CONNECTION HELPERS
// ============================================================================

// Network type is already exported at the top of the file

/**
 * Get RPC endpoint URL for a network
 */
export function getRpcEndpoint(network: Network = "devnet"): string {
  const envEndpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT;
  if (envEndpoint) return envEndpoint;

  switch (network) {
    case "localnet":
      return "http://127.0.0.1:8899";
    case "mainnet-beta":
      return "https://api.mainnet-beta.solana.com";
    case "devnet":
    default:
      return "https://api.devnet.solana.com";
  }
}

/**
 * Create a Kit RPC client
 */
export function createRpc(network: Network = "devnet"): Rpc<any> {
  const endpoint = getRpcEndpoint(network);
  return createSolanaRpc(endpoint);
}

// Singleton Kit RPC instance
let _kitRpc: Rpc<any> | null = null;
let _currentNetwork: Network | null = null;

/**
 * Get singleton Kit RPC client
 */
export function getKitRpc(network?: Network): Rpc<any> {
  const net = network || (process.env.NEXT_PUBLIC_SOLANA_NETWORK as Network) || "devnet";

  if (!_kitRpc || _currentNetwork !== net) {
    _kitRpc = createRpc(net);
    _currentNetwork = net;
  }

  return _kitRpc;
}

/**
 * Legacy connection helper (for backwards compatibility)
 */
export function getConnection(network: "devnet" | "mainnet-beta" = "devnet") {
  return new Connection(clusterApiUrl(network), "confirmed");
}

// ============================================================================
// ADDRESS CONVERSION HELPERS
// ============================================================================

/**
 * Convert legacy PublicKey to Kit Address
 */
export function toKitAddress(pubkey: PublicKey): Address {
  return address(pubkey.toBase58());
}

/**
 * Convert Kit Address to legacy PublicKey
 */
export function toLegacyPublicKey(addr: Address | string): PublicKey {
  return new PublicKey(addr);
}

// ============================================================================
// FORMAT HELPERS
// ============================================================================

export function formatSol(lamports: bigint | number): string {
  const sol = Number(lamports) / 1e9;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatRng(amount: bigint | number): string {
  const rng = Number(amount) / Number(ONE_RNG);
  return rng.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function formatCrap(amount: bigint | number): string {
  const crap = Number(amount) / Number(ONE_CRAP);
  return crap.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / 1e9;
}

export function solToLamports(sol: number): bigint {
  return BigInt(Math.floor(sol * 1e9));
}

// ============================================================================
// TIME / SLOT HELPERS
// ============================================================================

export function slotsToSeconds(slots: number): number {
  return (slots * SLOT_DURATION_MS) / 1000;
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

export function truncateAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// ============================================================================
// INSTRUCTION HELPERS (Legacy - for backwards compatibility)
// ============================================================================

// Instruction discriminators
const INSTRUCTION_START_ROUND = 22;

// Helper to convert number to little-endian bytes
function toLEBytes(value: bigint | number, bytes: number): Uint8Array {
  const arr = new Uint8Array(bytes);
  let v = BigInt(value);
  for (let i = 0; i < bytes; i++) {
    arr[i] = Number(v & 0xffn);
    v = v >> 8n;
  }
  return arr;
}

// Build StartRound instruction
export function buildStartRoundInstruction(
  signer: PublicKey,
  roundId: bigint,
  duration: number = 3000 // Default 3000 slots (~20 minutes)
): TransactionInstruction {
  const [boardAddress] = boardPDA();
  const [configAddress] = configPDA();
  const [roundAddress] = roundPDA(roundId);

  // Instruction data: discriminator (1 byte) + duration (8 bytes LE)
  const data = new Uint8Array(9);
  data[0] = INSTRUCTION_START_ROUND;
  data.set(toLEBytes(duration, 8), 1);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: configAddress, isSigner: false, isWritable: false },
      { pubkey: roundAddress, isSigner: false, isWritable: true },
    ],
    data: Buffer.from(data),
  });
}

// ============================================================================
// RE-EXPORTS from Kit
// ============================================================================

export {
  address,
  type Address,
  getProgramDerivedAddress,
  createSolanaRpc,
  type Rpc,
} from "@solana/kit";

export { fromLegacyPublicKey } from "@solana/compat";
