import { Connection, PublicKey } from "@solana/web3.js";

const DEVNET_RPC = "https://devnet.helius-rpc.com/?api-key=22043299-7cbe-491c-995a-2e216e3a7cc7";
const ORE_PROGRAM_ID = new PublicKey("JDcrnBXPW4o1G7bQgPHZZGtUPMFDLrosvqhTTHRWxXzK");
const SIGNER = new PublicKey("gUHM7aKpe5grLDvZq3sBMAwP68rwnPe5NJnULBc5t2C");

const connection = new Connection(DEVNET_RPC, "confirmed");

const [warPosition] = PublicKey.findProgramAddressSync(
  [Buffer.from("war_position"), SIGNER.toBuffer()],
  ORE_PROGRAM_ID
);

console.log("War Position PDA:", warPosition.toBase58());

const account = await connection.getAccountInfo(warPosition);
if (!account) {
  console.log("No War position found");
  process.exit(0);
}

console.log("Account data length:", account.data.length);

// WarPosition struct (with 8-byte discriminator from steel account! macro):
// - discriminator: u64 (8)
// - authority: Pubkey (32)
// - epoch_id: u64 (8)
// - round_id: u64 (8)
// - state: u8 (1)
// - player_card: u8 (1)
// - dealer_card: u8 (1)
// - player_war_card: u8 (1)
// - dealer_war_card: u8 (1)
// - _padding: [u8; 3]
// - ante_bet: u64 (8)
// - war_bet: u64 (8)
// - tie_bet: u64 (8)
// - pending_winnings: u64 (8)
// ...

const data = account.data;
const offsets = {
  discriminator: 0,
  authority: 8,
  epoch_id: 40,
  round_id: 48,
  state: 56,
  player_card: 57,
  dealer_card: 58,
  player_war_card: 59,
  dealer_war_card: 60,
  ante_bet: 64,
  war_bet: 72,
  tie_bet: 80,
  pending_winnings: 88,
};

console.log("Discriminator:", data.readBigUInt64LE(offsets.discriminator).toString());
console.log("Authority:", new PublicKey(data.slice(offsets.authority, offsets.authority + 32)).toBase58());
console.log("Epoch ID:", data.readBigUInt64LE(offsets.epoch_id).toString());
console.log("Round ID:", data.readBigUInt64LE(offsets.round_id).toString());
console.log("State:", data[offsets.state]);
console.log("Player card:", data[offsets.player_card]);
console.log("Dealer card:", data[offsets.dealer_card]);
console.log("Player war card:", data[offsets.player_war_card]);
console.log("Dealer war card:", data[offsets.dealer_war_card]);
console.log("Ante bet:", data.readBigUInt64LE(offsets.ante_bet).toString());
console.log("War bet:", data.readBigUInt64LE(offsets.war_bet).toString());
console.log("Tie bet:", data.readBigUInt64LE(offsets.tie_bet).toString());
console.log("Pending winnings:", data.readBigUInt64LE(offsets.pending_winnings).toString());
