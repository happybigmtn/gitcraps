use const_crypto::ed25519;
use solana_program::{pubkey, pubkey::Pubkey};

/// The authority allowed to initialize the program.
pub const ADMIN_ADDRESS: Pubkey = pubkey!("HBUh9g46wk2X89CvaNN15UmsznP59rh6od1h8JwYAopk");

/// The decimal precision of the ORE token.
/// There are 100 billion indivisible units per ORE (called "grams").
pub const TOKEN_DECIMALS: u8 = 11;

/// One ORE token, denominated in indivisible units.
pub const ONE_ORE: u64 = 10u64.pow(TOKEN_DECIMALS as u32);

/// The duration of one minute, in seconds.
pub const ONE_MINUTE: i64 = 60;

/// The duration of one hour, in seconds.
pub const ONE_HOUR: i64 = 60 * ONE_MINUTE;

/// The duration of one day, in seconds.
pub const ONE_DAY: i64 = 24 * ONE_HOUR;

/// The number of seconds for when the winning square expires.
pub const ONE_WEEK: i64 = 7 * ONE_DAY;

/// The number of slots in one week.
pub const ONE_MINUTE_SLOTS: u64 = 150;

/// The number of slots in one hour.
pub const ONE_HOUR_SLOTS: u64 = 60 * ONE_MINUTE_SLOTS;

/// The number of slots in 12 hours.
pub const TWELVE_HOURS_SLOTS: u64 = 12 * ONE_HOUR_SLOTS;

/// The number of slots in one day.
pub const ONE_DAY_SLOTS: u64 = 24 * ONE_HOUR_SLOTS;

/// The number of slots in one week.
pub const ONE_WEEK_SLOTS: u64 = 7 * ONE_DAY_SLOTS;

/// The number of slots for breather between rounds.
pub const INTERMISSION_SLOTS: u64 = 35;

/// The maximum token supply (5 million).
pub const MAX_SUPPLY: u64 = ONE_ORE * 5_000_000;

/// The seed of the automation account PDA.
pub const AUTOMATION: &[u8] = b"automation";

/// The seed of the board account PDA.
pub const BOARD: &[u8] = b"board";

/// The seed of the config account PDA.
pub const CONFIG: &[u8] = b"config";

/// The seed of the miner account PDA.
pub const MINER: &[u8] = b"miner";

/// The seed of the seeker account PDA.
pub const SEEKER: &[u8] = b"seeker";

/// The seed of the square account PDA.
pub const SQUARE: &[u8] = b"square";

/// The seed of the stake account PDA.
pub const STAKE: &[u8] = b"stake";

/// The seed of the round account PDA.
pub const ROUND: &[u8] = b"round";

/// The seed of the treasury account PDA.
pub const TREASURY: &[u8] = b"treasury";

/// Program id for const pda derivations
const PROGRAM_ID: [u8; 32] = unsafe { *(&crate::id() as *const Pubkey as *const [u8; 32]) };

/// The address of the config account.
pub const CONFIG_ADDRESS: Pubkey =
    Pubkey::new_from_array(ed25519::derive_program_address(&[CONFIG], &PROGRAM_ID).0);

/// The address of the ORE mint account (mainnet).
pub const MINT_ADDRESS: Pubkey = pubkey!("oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp");

/// The address of the sol mint account.
pub const SOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");

// ============================================================================
// DEVNET TOKEN SYSTEM - RNG (staking) / CRAP (rewards)
// ============================================================================

/// The RNG token mint address (devnet).
/// RNG is the universal staking token used across all games.
/// Users stake RNG to play games and earn game-specific reward tokens.
pub const RNG_MINT_ADDRESS: Pubkey = pubkey!("RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

/// The CRAP token mint address (devnet).
/// CRAP is the reward token for the OreCraps dice game.
/// Earned by correctly predicting dice combinations.
pub const CRAP_MINT_ADDRESS: Pubkey = pubkey!("CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

/// The decimal precision of the RNG token.
pub const RNG_TOKEN_DECIMALS: u8 = 9;

/// The decimal precision of the CRAP token.
pub const CRAP_TOKEN_DECIMALS: u8 = 9;

/// One RNG token, denominated in indivisible units.
pub const ONE_RNG: u64 = 10u64.pow(RNG_TOKEN_DECIMALS as u32);

/// One CRAP token, denominated in indivisible units.
pub const ONE_CRAP: u64 = 10u64.pow(CRAP_TOKEN_DECIMALS as u32);

/// The maximum CRAP token supply (100 million for devnet testing).
pub const MAX_CRAP_SUPPLY: u64 = ONE_CRAP * 100_000_000;

/// The address to indicate ORE rewards are split between all miners.
pub const SPLIT_ADDRESS: Pubkey = pubkey!("SpLiT11111111111111111111111111111111111112");

/// The address of the treasury account.
pub const TREASURY_ADDRESS: Pubkey =
    Pubkey::new_from_array(ed25519::derive_program_address(&[TREASURY], &PROGRAM_ID).0);

/// The address of the treasury account.
pub const TREASURY_BUMP: u8 = ed25519::derive_program_address(&[TREASURY], &PROGRAM_ID).1;

/// Denominator for fee calculations.
pub const DENOMINATOR_BPS: u64 = 10_000;

/// The address of the boost reserve token account.
pub const BOOST_RESERVE_TOKEN: Pubkey = pubkey!("Gce36ZUsBDJsoLrfCBxUB5Sfq2DsGunofStvxFx6rBiD");

/// The fee paid to bots if they checkpoint a user.
pub const CHECKPOINT_FEE: u64 = 10_000; // 0.00001 SOL

/// The number of squares on the board (6x6 grid for dice combinations).
pub const BOARD_SIZE: usize = 36;

// ============================================================================
// CRAPS GAME CONSTANTS
// ============================================================================

/// The seed of the craps game account PDA.
pub const CRAPS_GAME: &[u8] = b"craps_game";

/// The seed of the craps position account PDA.
pub const CRAPS_POSITION: &[u8] = b"craps_position";

/// Pass Line / Don't Pass payout ratio (1:1).
pub const PASS_LINE_PAYOUT_NUM: u64 = 1;
pub const PASS_LINE_PAYOUT_DEN: u64 = 1;

/// Field bet payout (1:1 for most, 2:1 for 2 and 12).
pub const FIELD_PAYOUT_NORMAL_NUM: u64 = 1;
pub const FIELD_PAYOUT_NORMAL_DEN: u64 = 1;
pub const FIELD_PAYOUT_2_12_NUM: u64 = 2;
pub const FIELD_PAYOUT_2_12_DEN: u64 = 1;

/// Any Seven payout (4:1).
pub const ANY_SEVEN_PAYOUT_NUM: u64 = 4;
pub const ANY_SEVEN_PAYOUT_DEN: u64 = 1;

/// Any Craps payout (7:1).
pub const ANY_CRAPS_PAYOUT_NUM: u64 = 7;
pub const ANY_CRAPS_PAYOUT_DEN: u64 = 1;

/// Yo Eleven payout (15:1).
pub const YO_ELEVEN_PAYOUT_NUM: u64 = 15;
pub const YO_ELEVEN_PAYOUT_DEN: u64 = 1;

/// Aces (2) payout (30:1).
pub const ACES_PAYOUT_NUM: u64 = 30;
pub const ACES_PAYOUT_DEN: u64 = 1;

/// Twelve payout (30:1).
pub const TWELVE_PAYOUT_NUM: u64 = 30;
pub const TWELVE_PAYOUT_DEN: u64 = 1;

/// Place bet payouts (point -> numerator, denominator).
/// Place 4 or 10: 9:5
pub const PLACE_4_10_PAYOUT_NUM: u64 = 9;
pub const PLACE_4_10_PAYOUT_DEN: u64 = 5;
/// Place 5 or 9: 7:5
pub const PLACE_5_9_PAYOUT_NUM: u64 = 7;
pub const PLACE_5_9_PAYOUT_DEN: u64 = 5;
/// Place 6 or 8: 7:6
pub const PLACE_6_8_PAYOUT_NUM: u64 = 7;
pub const PLACE_6_8_PAYOUT_DEN: u64 = 6;

/// True odds payouts (for odds bets - 0% house edge).
/// 4 or 10: 2:1
pub const TRUE_ODDS_4_10_NUM: u64 = 2;
pub const TRUE_ODDS_4_10_DEN: u64 = 1;
/// 5 or 9: 3:2
pub const TRUE_ODDS_5_9_NUM: u64 = 3;
pub const TRUE_ODDS_5_9_DEN: u64 = 2;
/// 6 or 8: 6:5
pub const TRUE_ODDS_6_8_NUM: u64 = 6;
pub const TRUE_ODDS_6_8_DEN: u64 = 5;

/// Hardway payouts.
/// Hard 4 or 10: 7:1
pub const HARD_4_10_PAYOUT_NUM: u64 = 7;
pub const HARD_4_10_PAYOUT_DEN: u64 = 1;
/// Hard 6 or 8: 9:1
pub const HARD_6_8_PAYOUT_NUM: u64 = 9;
pub const HARD_6_8_PAYOUT_DEN: u64 = 1;

/// Maximum single bet amount (100 SOL).
pub const MAX_BET_AMOUNT: u64 = 100 * solana_program::native_token::LAMPORTS_PER_SOL;
