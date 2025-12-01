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

/// The RNG token mint address.
/// RNG is the universal staking token used across all games.
/// Users stake RNG to play games and earn game-specific reward tokens.
///
/// For localnet: Use vanity address RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump (loaded via --account flag)
/// For devnet:   Use 8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs (created via spl-token)
#[cfg(feature = "devnet")]
pub const RNG_MINT_ADDRESS: Pubkey = pubkey!("8HJyJPD4iWD1X9FxZEjDuVpPqSBvNeaJCczXeK2xsShs");
#[cfg(not(feature = "devnet"))]
pub const RNG_MINT_ADDRESS: Pubkey = pubkey!("RNGqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump");

/// The CRAP token mint address.
/// CRAP is the reward token for the OreCraps dice game.
/// Earned by correctly predicting dice combinations.
///
/// For localnet: Use vanity address CRAPqnVVhpuFfWBJJbiZ3BtG1MrXF3cvD3mLSXpnPump (loaded via --account flag)
/// For devnet:   Use 7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf (created via spl-token)
#[cfg(feature = "devnet")]
pub const CRAP_MINT_ADDRESS: Pubkey = pubkey!("7frAenkamJSASBH9YukkzBsSMz9paQdYuSGw4SjWkXrf");
#[cfg(not(feature = "devnet"))]
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

/// The seed of the craps vault token account PDA (holds CRAP tokens for the house).
pub const CRAPS_VAULT: &[u8] = b"craps_vault";

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

// ============================================================================
// BONUS CRAPS SIDE BETS (Small, Tall, All)
// ============================================================================
// These bets win if all required totals are rolled before a 7.
// - Small: Hit all of 2, 3, 4, 5, 6 before a 7 (30:1)
// - Tall: Hit all of 8, 9, 10, 11, 12 before a 7 (30:1)
// - All: Hit all of 2-6 and 8-12 before a 7 (150:1)

/// Small bet payout (30:1) - hit 2,3,4,5,6 before 7.
pub const BONUS_SMALL_PAYOUT_NUM: u64 = 30;
pub const BONUS_SMALL_PAYOUT_DEN: u64 = 1;

/// Tall bet payout (30:1) - hit 8,9,10,11,12 before 7.
pub const BONUS_TALL_PAYOUT_NUM: u64 = 30;
pub const BONUS_TALL_PAYOUT_DEN: u64 = 1;

/// All bet payout (150:1) - hit all 2-6 and 8-12 before 7.
pub const BONUS_ALL_PAYOUT_NUM: u64 = 150;
pub const BONUS_ALL_PAYOUT_DEN: u64 = 1;

/// Bitmask for Small hits tracking (bits 0-4 = totals 2,3,4,5,6).
/// When all 5 bits are set (0b11111 = 31), Small wins.
pub const BONUS_SMALL_COMPLETE: u8 = 0b11111;

/// Bitmask for Tall hits tracking (bits 0-4 = totals 8,9,10,11,12).
/// When all 5 bits are set (0b11111 = 31), Tall wins.
pub const BONUS_TALL_COMPLETE: u8 = 0b11111;

// ============================================================================
// FIRE BET (Pay Table A)
// ============================================================================
// Wins based on unique points made (4,5,6,8,9,10) before seven-out.
// Must make at least 4 unique points to win.

/// Fire Bet - 4 unique points (24:1)
pub const FIRE_4_POINTS_PAYOUT_NUM: u64 = 24;
pub const FIRE_4_POINTS_PAYOUT_DEN: u64 = 1;

/// Fire Bet - 5 unique points (249:1)
pub const FIRE_5_POINTS_PAYOUT_NUM: u64 = 249;
pub const FIRE_5_POINTS_PAYOUT_DEN: u64 = 1;

/// Fire Bet - 6 unique points (999:1)
pub const FIRE_6_POINTS_PAYOUT_NUM: u64 = 999;
pub const FIRE_6_POINTS_PAYOUT_DEN: u64 = 1;

// ============================================================================
// FIELDER'S CHOICE (Single-roll bets)
// ============================================================================
// Three separate one-roll bets. "5 for 1" = 4 to 1, "3 for 1" = 2 to 1

/// Fielder's Choice 1: 2, 3, or 4 (4:1)
pub const FIELDERS_1_PAYOUT_NUM: u64 = 4;
pub const FIELDERS_1_PAYOUT_DEN: u64 = 1;

/// Fielder's Choice 2: 4, 9, or 10 (2:1)
pub const FIELDERS_2_PAYOUT_NUM: u64 = 2;
pub const FIELDERS_2_PAYOUT_DEN: u64 = 1;

/// Fielder's Choice 3: 10, 11, or 12 (4:1)
pub const FIELDERS_3_PAYOUT_NUM: u64 = 4;
pub const FIELDERS_3_PAYOUT_DEN: u64 = 1;

// ============================================================================
// DIFFERENT DOUBLES
// ============================================================================
// Pays based on unique doubles rolled before 7.

/// Different Doubles - 3 unique doubles (4:1)
pub const DIFF_DOUBLES_3_PAYOUT_NUM: u64 = 4;
pub const DIFF_DOUBLES_3_PAYOUT_DEN: u64 = 1;

/// Different Doubles - 4 unique doubles (8:1)
pub const DIFF_DOUBLES_4_PAYOUT_NUM: u64 = 8;
pub const DIFF_DOUBLES_4_PAYOUT_DEN: u64 = 1;

/// Different Doubles - 5 unique doubles (15:1)
pub const DIFF_DOUBLES_5_PAYOUT_NUM: u64 = 15;
pub const DIFF_DOUBLES_5_PAYOUT_DEN: u64 = 1;

/// Different Doubles - 6 unique doubles (100:1)
pub const DIFF_DOUBLES_6_PAYOUT_NUM: u64 = 100;
pub const DIFF_DOUBLES_6_PAYOUT_DEN: u64 = 1;

// ============================================================================
// RIDE THE LINE (Pay Table 7 - best odds)
// ============================================================================
// Pays based on consecutive pass line wins before seven-out.

/// Ride the Line - 3 wins (2:1)
pub const RIDE_3_WINS_PAYOUT_NUM: u64 = 2;
pub const RIDE_3_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 4 wins (3:1)
pub const RIDE_4_WINS_PAYOUT_NUM: u64 = 3;
pub const RIDE_4_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 5 wins (5:1)
pub const RIDE_5_WINS_PAYOUT_NUM: u64 = 5;
pub const RIDE_5_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 6 wins (8:1)
pub const RIDE_6_WINS_PAYOUT_NUM: u64 = 8;
pub const RIDE_6_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 7 wins (10:1)
pub const RIDE_7_WINS_PAYOUT_NUM: u64 = 10;
pub const RIDE_7_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 8 wins (15:1)
pub const RIDE_8_WINS_PAYOUT_NUM: u64 = 15;
pub const RIDE_8_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 9 wins (25:1)
pub const RIDE_9_WINS_PAYOUT_NUM: u64 = 25;
pub const RIDE_9_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 10 wins (40:1)
pub const RIDE_10_WINS_PAYOUT_NUM: u64 = 40;
pub const RIDE_10_WINS_PAYOUT_DEN: u64 = 1;

/// Ride the Line - 11+ wins (150:1)
pub const RIDE_11_WINS_PAYOUT_NUM: u64 = 150;
pub const RIDE_11_WINS_PAYOUT_DEN: u64 = 1;

// ============================================================================
// MUGSY'S CORNER
// ============================================================================
// Wins on 7 (come-out or after point established).

/// Mugsy's Corner - 7 on come-out (2:1)
pub const MUGSY_COMEOUT_7_PAYOUT_NUM: u64 = 2;
pub const MUGSY_COMEOUT_7_PAYOUT_DEN: u64 = 1;

/// Mugsy's Corner - 7 after point established (3:1)
pub const MUGSY_POINT_7_PAYOUT_NUM: u64 = 3;
pub const MUGSY_POINT_7_PAYOUT_DEN: u64 = 1;

// ============================================================================
// HOT HAND (Hard Rockin' Dice)
// ============================================================================
// Must roll all totals 2-12 (except 7) before a 7.

/// Hot Hand - 9 of 10 totals hit (20:1)
pub const HOT_HAND_9_PAYOUT_NUM: u64 = 20;
pub const HOT_HAND_9_PAYOUT_DEN: u64 = 1;

/// Hot Hand - 10 of 10 totals hit (80:1)
pub const HOT_HAND_10_PAYOUT_NUM: u64 = 80;
pub const HOT_HAND_10_PAYOUT_DEN: u64 = 1;

// ============================================================================
// REPLAY BET
// ============================================================================
// Pays when same point is made multiple times in one shooter's turn.

/// Replay - Point 4/10 made 3 times (120:1)
pub const REPLAY_4_10_3X_PAYOUT_NUM: u64 = 120;
pub const REPLAY_4_10_3X_PAYOUT_DEN: u64 = 1;

/// Replay - Point 4/10 made 4+ times (1000:1)
pub const REPLAY_4_10_4X_PAYOUT_NUM: u64 = 1000;
pub const REPLAY_4_10_4X_PAYOUT_DEN: u64 = 1;

/// Replay - Point 5/9 made 3 times (95:1)
pub const REPLAY_5_9_3X_PAYOUT_NUM: u64 = 95;
pub const REPLAY_5_9_3X_PAYOUT_DEN: u64 = 1;

/// Replay - Point 5/9 made 4+ times (500:1)
pub const REPLAY_5_9_4X_PAYOUT_NUM: u64 = 500;
pub const REPLAY_5_9_4X_PAYOUT_DEN: u64 = 1;

/// Replay - Point 6/8 made 3 times (70:1)
pub const REPLAY_6_8_3X_PAYOUT_NUM: u64 = 70;
pub const REPLAY_6_8_3X_PAYOUT_DEN: u64 = 1;

/// Replay - Point 6/8 made 4+ times (100:1)
pub const REPLAY_6_8_4X_PAYOUT_NUM: u64 = 100;
pub const REPLAY_6_8_4X_PAYOUT_DEN: u64 = 1;

// ============================================================================
// HOP BET (Single-roll true odds bets on dice sums)
// ============================================================================
// Pays at true odds (0% house edge) for single-roll bets on specific dice sums.
// Probability = ways to roll / 36

/// Hop 2 (1/36 probability) - true odds 35:1
pub const HOP_2_PAYOUT_NUM: u64 = 35;
pub const HOP_2_PAYOUT_DEN: u64 = 1;

/// Hop 3 (2/36 probability) - true odds 17:1
pub const HOP_3_PAYOUT_NUM: u64 = 17;
pub const HOP_3_PAYOUT_DEN: u64 = 1;

/// Hop 4 (3/36 probability) - true odds 11:1
pub const HOP_4_PAYOUT_NUM: u64 = 11;
pub const HOP_4_PAYOUT_DEN: u64 = 1;

/// Hop 5 (4/36 probability) - true odds 8:1
pub const HOP_5_PAYOUT_NUM: u64 = 8;
pub const HOP_5_PAYOUT_DEN: u64 = 1;

/// Hop 6 (5/36 probability) - true odds 31:5 (6.2:1)
pub const HOP_6_PAYOUT_NUM: u64 = 31;
pub const HOP_6_PAYOUT_DEN: u64 = 5;

/// Hop 7 (6/36 probability) - true odds 5:1
pub const HOP_7_PAYOUT_NUM: u64 = 5;
pub const HOP_7_PAYOUT_DEN: u64 = 1;

/// Hop 8 (5/36 probability) - true odds 31:5 (6.2:1)
pub const HOP_8_PAYOUT_NUM: u64 = 31;
pub const HOP_8_PAYOUT_DEN: u64 = 5;

/// Hop 9 (4/36 probability) - true odds 8:1
pub const HOP_9_PAYOUT_NUM: u64 = 8;
pub const HOP_9_PAYOUT_DEN: u64 = 1;

/// Hop 10 (3/36 probability) - true odds 11:1
pub const HOP_10_PAYOUT_NUM: u64 = 11;
pub const HOP_10_PAYOUT_DEN: u64 = 1;

/// Hop 11 (2/36 probability) - true odds 17:1
pub const HOP_11_PAYOUT_NUM: u64 = 17;
pub const HOP_11_PAYOUT_DEN: u64 = 1;

/// Hop 12 (1/36 probability) - true odds 35:1
pub const HOP_12_PAYOUT_NUM: u64 = 35;
pub const HOP_12_PAYOUT_DEN: u64 = 1;

// ============================================================================
// LAY BET (Inverse true odds - betting 7 comes before a point)
// ============================================================================
// Lay bets pay inverse of true odds (laying odds against the number).
// Example: Lay 4 pays 1:2 (risk 2 to win 1) because 4 has 3 ways vs 7's 6 ways.

/// Lay 4/10 (3 ways vs 6 ways) - pays 1:2
pub const LAY_4_10_PAYOUT_NUM: u64 = 1;
pub const LAY_4_10_PAYOUT_DEN: u64 = 2;

/// Lay 5/9 (4 ways vs 6 ways) - pays 2:3
pub const LAY_5_9_PAYOUT_NUM: u64 = 2;
pub const LAY_5_9_PAYOUT_DEN: u64 = 3;

/// Lay 6/8 (5 ways vs 6 ways) - pays 5:6
pub const LAY_6_8_PAYOUT_NUM: u64 = 5;
pub const LAY_6_8_PAYOUT_DEN: u64 = 6;

// ============================================================================
// YES BET (Sum hits before 7 - True odds based on 7's probability)
// ============================================================================
// Yes bets win when chosen sum (2-12, except 7) rolls before 7.
// True odds = 6 / ways_to_roll_sum (7 has 6 ways)
// 0% house edge

/// Yes 2 (1 way vs 6 ways for 7) - pays 6:1
pub const YES_2_PAYOUT_NUM: u64 = 6;
pub const YES_2_PAYOUT_DEN: u64 = 1;

/// Yes 3 (2 ways vs 6 ways for 7) - pays 3:1
pub const YES_3_PAYOUT_NUM: u64 = 3;
pub const YES_3_PAYOUT_DEN: u64 = 1;

/// Yes 4 (3 ways vs 6 ways for 7) - pays 2:1
pub const YES_4_PAYOUT_NUM: u64 = 2;
pub const YES_4_PAYOUT_DEN: u64 = 1;

/// Yes 5 (4 ways vs 6 ways for 7) - pays 3:2
pub const YES_5_PAYOUT_NUM: u64 = 3;
pub const YES_5_PAYOUT_DEN: u64 = 2;

/// Yes 6 (5 ways vs 6 ways for 7) - pays 6:5
pub const YES_6_PAYOUT_NUM: u64 = 6;
pub const YES_6_PAYOUT_DEN: u64 = 5;

/// Yes 8 (5 ways vs 6 ways for 7) - pays 6:5
pub const YES_8_PAYOUT_NUM: u64 = 6;
pub const YES_8_PAYOUT_DEN: u64 = 5;

/// Yes 9 (4 ways vs 6 ways for 7) - pays 3:2
pub const YES_9_PAYOUT_NUM: u64 = 3;
pub const YES_9_PAYOUT_DEN: u64 = 2;

/// Yes 10 (3 ways vs 6 ways for 7) - pays 2:1
pub const YES_10_PAYOUT_NUM: u64 = 2;
pub const YES_10_PAYOUT_DEN: u64 = 1;

/// Yes 11 (2 ways vs 6 ways for 7) - pays 3:1
pub const YES_11_PAYOUT_NUM: u64 = 3;
pub const YES_11_PAYOUT_DEN: u64 = 1;

/// Yes 12 (1 way vs 6 ways for 7) - pays 6:1
pub const YES_12_PAYOUT_NUM: u64 = 6;
pub const YES_12_PAYOUT_DEN: u64 = 1;

// ============================================================================
// NO BET (7 hits before sum - Inverse true odds)
// ============================================================================
// No bets win when 7 rolls before chosen sum (2-12, except 7).
// Inverse true odds = ways_to_roll_sum / 6 (7 has 6 ways)
// 0% house edge

/// No 2 (6 ways for 7 vs 1 way) - pays 1:6
pub const NO_2_PAYOUT_NUM: u64 = 1;
pub const NO_2_PAYOUT_DEN: u64 = 6;

/// No 3 (6 ways for 7 vs 2 ways) - pays 1:3
pub const NO_3_PAYOUT_NUM: u64 = 1;
pub const NO_3_PAYOUT_DEN: u64 = 3;

/// No 4 (6 ways for 7 vs 3 ways) - pays 1:2
pub const NO_4_PAYOUT_NUM: u64 = 1;
pub const NO_4_PAYOUT_DEN: u64 = 2;

/// No 5 (6 ways for 7 vs 4 ways) - pays 2:3
pub const NO_5_PAYOUT_NUM: u64 = 2;
pub const NO_5_PAYOUT_DEN: u64 = 3;

/// No 6 (6 ways for 7 vs 5 ways) - pays 5:6
pub const NO_6_PAYOUT_NUM: u64 = 5;
pub const NO_6_PAYOUT_DEN: u64 = 6;

/// No 8 (6 ways for 7 vs 5 ways) - pays 5:6
pub const NO_8_PAYOUT_NUM: u64 = 5;
pub const NO_8_PAYOUT_DEN: u64 = 6;

/// No 9 (6 ways for 7 vs 4 ways) - pays 2:3
pub const NO_9_PAYOUT_NUM: u64 = 2;
pub const NO_9_PAYOUT_DEN: u64 = 3;

/// No 10 (6 ways for 7 vs 3 ways) - pays 1:2
pub const NO_10_PAYOUT_NUM: u64 = 1;
pub const NO_10_PAYOUT_DEN: u64 = 2;

/// No 11 (6 ways for 7 vs 2 ways) - pays 1:3
pub const NO_11_PAYOUT_NUM: u64 = 1;
pub const NO_11_PAYOUT_DEN: u64 = 3;

/// No 12 (6 ways for 7 vs 1 way) - pays 1:6
pub const NO_12_PAYOUT_NUM: u64 = 1;
pub const NO_12_PAYOUT_DEN: u64 = 6;

// ============================================================================
// NEXT BET (Single-roll true odds - same as HOP)
// ============================================================================
// Next bet constants are the same as HOP_* constants above.
// They pay at true odds for single-roll bets on specific dice sums.
