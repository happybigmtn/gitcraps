use steel::*;

/// ORE program error codes
/// Range 1000-1999: Game errors
/// Range 2000-2999: Validation errors
/// Range 3000-3999: System errors
#[derive(Debug, Error, Clone, Copy, PartialEq, Eq, IntoPrimitive)]
#[repr(u32)]
pub enum OreError {
    // Game Errors (1000-1999)
    #[error("Position has already been settled")]
    AlreadySettled = 1001,

    #[error("Round is not currently active")]
    RoundNotActive = 1002,

    #[error("Round has expired")]
    RoundExpired = 1003,

    #[error("House bankroll insufficient for bet")]
    InsufficientBankroll = 1004,

    #[error("Bet amount below minimum")]
    BetTooSmall = 1005,

    #[error("Bet amount exceeds maximum")]
    BetTooLarge = 1006,

    #[error("No active bets to settle")]
    NoBetsToSettle = 1007,

    // Validation Errors (2000-2999)
    #[error("Invalid bet type specified")]
    InvalidBetType = 2001,

    #[error("Invalid bet amount")]
    InvalidBetAmount = 2002,

    #[error("Invalid point value")]
    InvalidPoint = 2003,

    #[error("Signer is not the position authority")]
    InvalidAuthority = 2004,

    #[error("Invalid account provided")]
    InvalidAccount = 2005,

    // System Errors (3000-3999)
    #[error("Arithmetic operation overflowed")]
    ArithmeticOverflow = 3001,

    #[error("Required account not found")]
    AccountNotFound = 3002,

    #[error("Failed to deserialize account data")]
    DeserializationFailed = 3003,
}

error!(OreError);
