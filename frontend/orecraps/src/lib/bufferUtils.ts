/**
 * Shared buffer utilities for reading/writing binary data.
 * Used across API routes and entropy operations.
 */

/**
 * Convert a bigint to little-endian bytes.
 * @param value - The bigint value to convert
 * @param length - Number of bytes to output
 */
export function toLeBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Number((value >> BigInt(8 * i)) & 0xffn);
  }
  return bytes;
}

/**
 * Read a u64 from a byte array at the given offset.
 * @param data - The byte array
 * @param offset - Starting offset
 */
export function readU64(data: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < 8; i++) {
    value |= BigInt(data[offset + i]) << BigInt(8 * i);
  }
  return value;
}

/**
 * Read a u64 from a Buffer at the given offset.
 * @param data - The buffer
 * @param offset - Starting offset
 */
export function readU64FromBuffer(data: Buffer, offset: number): bigint {
  return data.readBigUInt64LE(offset);
}
