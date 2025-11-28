/**
 * BigInt conversion utilities to prevent precision loss
 */

export const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
export const MIN_SAFE_INTEGER = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Safely converts a BigInt to a Number, throwing an error if the value would lose precision
 * @param value - The BigInt value to convert
 * @param context - Optional context string for better error messages
 * @throws Error if the value exceeds the safe integer range
 */
export function safeToNumber(value: bigint, context?: string): number {
  if (value > MAX_SAFE_INTEGER || value < MIN_SAFE_INTEGER) {
    const contextMsg = context ? ` (${context})` : '';
    throw new Error(
      `BigInt value ${value} exceeds safe integer range${contextMsg}. ` +
      `Max safe: ${Number.MAX_SAFE_INTEGER}, Min safe: ${Number.MIN_SAFE_INTEGER}`
    );
  }
  return Number(value);
}

/**
 * Converts BigInt to Number for display purposes only.
 * Use this when you know the precision loss is acceptable (e.g., UI display).
 * @param value - The BigInt value to convert
 * @param decimals - Number of decimal places (for lamports conversion)
 */
export function toDisplayNumber(value: bigint, decimals: number = 0): number {
  if (decimals > 0) {
    const divisor = BigInt(10 ** decimals);
    return Number(value) / Number(divisor);
  }
  return Number(value);
}

/**
 * Safely compares BigInt values for use in Math.max/min operations
 * @param values - Array of BigInt values to compare
 * @returns The maximum BigInt value
 */
export function bigIntMax(...values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  return values.reduce((max, val) => val > max ? val : max);
}

/**
 * Safely compares BigInt values for use in Math.max/min operations
 * @param values - Array of BigInt values to compare
 * @returns The minimum BigInt value
 */
export function bigIntMin(...values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  return values.reduce((min, val) => val < min ? val : min);
}
