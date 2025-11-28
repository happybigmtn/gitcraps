/**
 * ORE program error codes
 * Range 1000-1999: Game errors
 * Range 2000-2999: Validation errors
 * Range 3000-3999: System errors
 */
export enum OreErrorCode {
  // Game Errors (1000-1999)
  ALREADY_SETTLED = 1001,
  ROUND_NOT_ACTIVE = 1002,
  ROUND_EXPIRED = 1003,
  INSUFFICIENT_BANKROLL = 1004,
  BET_TOO_SMALL = 1005,
  BET_TOO_LARGE = 1006,
  NO_BETS_TO_SETTLE = 1007,

  // Validation Errors (2000-2999)
  INVALID_BET_TYPE = 2001,
  INVALID_BET_AMOUNT = 2002,
  INVALID_POINT = 2003,
  INVALID_AUTHORITY = 2004,
  INVALID_ACCOUNT = 2005,

  // System Errors (3000-3999)
  ARITHMETIC_OVERFLOW = 3001,
  ACCOUNT_NOT_FOUND = 3002,
  DESERIALIZATION_FAILED = 3003,
}

export const ERROR_MESSAGES: Record<OreErrorCode, string> = {
  [OreErrorCode.ALREADY_SETTLED]: "Position has already been settled",
  [OreErrorCode.ROUND_NOT_ACTIVE]: "Round is not currently active",
  [OreErrorCode.ROUND_EXPIRED]: "Round has expired",
  [OreErrorCode.INSUFFICIENT_BANKROLL]: "House bankroll insufficient for bet",
  [OreErrorCode.BET_TOO_SMALL]: "Bet amount below minimum",
  [OreErrorCode.BET_TOO_LARGE]: "Bet amount exceeds maximum",
  [OreErrorCode.NO_BETS_TO_SETTLE]: "No active bets to settle",
  [OreErrorCode.INVALID_BET_TYPE]: "Invalid bet type specified",
  [OreErrorCode.INVALID_BET_AMOUNT]: "Invalid bet amount",
  [OreErrorCode.INVALID_POINT]: "Invalid point value",
  [OreErrorCode.INVALID_AUTHORITY]: "Signer is not the position authority",
  [OreErrorCode.INVALID_ACCOUNT]: "Invalid account provided",
  [OreErrorCode.ARITHMETIC_OVERFLOW]: "Arithmetic operation overflowed",
  [OreErrorCode.ACCOUNT_NOT_FOUND]: "Required account not found",
  [OreErrorCode.DESERIALIZATION_FAILED]: "Failed to deserialize account data",
};

/**
 * Parse a program error code into a structured error object
 */
export function parseOreError(
  errorCode: number
): { code: OreErrorCode; message: string } | null {
  if (errorCode in OreErrorCode) {
    const code = errorCode as OreErrorCode;
    return {
      code,
      message: ERROR_MESSAGES[code] || "Unknown error",
    };
  }
  return null;
}

/**
 * Check if an error code is a game error (1000-1999)
 */
export function isGameError(errorCode: number): boolean {
  return errorCode >= 1000 && errorCode < 2000;
}

/**
 * Check if an error code is a validation error (2000-2999)
 */
export function isValidationError(errorCode: number): boolean {
  return errorCode >= 2000 && errorCode < 3000;
}

/**
 * Check if an error code is a system error (3000-3999)
 */
export function isSystemError(errorCode: number): boolean {
  return errorCode >= 3000 && errorCode < 4000;
}

/**
 * Get the error category as a string
 */
export function getErrorCategory(
  errorCode: number
): "game" | "validation" | "system" | "unknown" {
  if (isGameError(errorCode)) return "game";
  if (isValidationError(errorCode)) return "validation";
  if (isSystemError(errorCode)) return "system";
  return "unknown";
}
