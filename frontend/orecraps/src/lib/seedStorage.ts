import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const STORAGE_DIR = process.env.SEED_STORAGE_DIR || path.join(process.env.HOME || '/root', '.ore-seeds');
const ENCRYPTION_KEY = process.env.SEED_ENCRYPTION_KEY; // Optional encryption

/**
 * Validate that the encryption key is exactly 32 bytes (64 hex characters) for AES-256
 */
function validateEncryptionKey(): void {
  if (!ENCRYPTION_KEY) return; // Encryption is optional

  const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
  if (keyBuffer.length !== 32) {
    throw new Error(
      `SEED_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). Got ${keyBuffer.length} bytes.`
    );
  }
}

// Call on module load
validateEncryptionKey();

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Validate that varAddress is a valid base58 address with no path traversal sequences
 * @param varAddress - The Var account address to validate
 * @returns true if valid, false otherwise
 */
function validateVarAddress(varAddress: string): boolean {
  // Base58 addresses should only contain valid characters (no slashes, dots, etc)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (!base58Regex.test(varAddress)) return false;

  // Double-check no path traversal sequences
  if (varAddress.includes('..') || varAddress.includes('/') || varAddress.includes('\\')) {
    return false;
  }
  return true;
}

/**
 * Store a seed for a given Var address
 * @param varAddress - The Var account address (base58 string)
 * @param seed - The 32-byte seed buffer
 */
export function storeSeed(varAddress: string, seed: Buffer): void {
  if (!validateVarAddress(varAddress)) {
    throw new Error('Invalid varAddress: must be a valid base58 string with no path traversal sequences');
  }
  const filePath = path.join(STORAGE_DIR, `${varAddress}.seed`);
  const data = ENCRYPTION_KEY ? encrypt(seed) : seed;
  fs.writeFileSync(filePath, data, { mode: 0o600 });
}

/**
 * Retrieve a seed for a given Var address
 * @param varAddress - The Var account address (base58 string)
 * @returns The 32-byte seed buffer, or null if not found
 */
export function retrieveSeed(varAddress: string): Buffer | null {
  if (!validateVarAddress(varAddress)) {
    throw new Error('Invalid varAddress: must be a valid base58 string with no path traversal sequences');
  }
  const filePath = path.join(STORAGE_DIR, `${varAddress}.seed`);
  if (!fs.existsSync(filePath)) return null;
  const data = fs.readFileSync(filePath);
  return ENCRYPTION_KEY ? decrypt(data) : data;
}

/**
 * Delete a seed for a given Var address
 * @param varAddress - The Var account address (base58 string)
 * @returns true if seed was deleted, false if it didn't exist
 */
export function deleteSeed(varAddress: string): boolean {
  if (!validateVarAddress(varAddress)) {
    throw new Error('Invalid varAddress: must be a valid base58 string with no path traversal sequences');
  }
  const filePath = path.join(STORAGE_DIR, `${varAddress}.seed`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

/**
 * Encrypt seed data using AES-256-GCM
 * @param data - The seed buffer to encrypt
 * @returns Encrypted buffer with IV, tag, and ciphertext
 */
function encrypt(data: Buffer): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('SEED_ENCRYPTION_KEY must be set for encryption');
  }

  // Simple AES-256-GCM encryption
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

/**
 * Decrypt seed data using AES-256-GCM
 * @param data - The encrypted buffer with IV, tag, and ciphertext
 * @returns Decrypted seed buffer
 */
function decrypt(data: Buffer): Buffer {
  if (!ENCRYPTION_KEY) {
    throw new Error('SEED_ENCRYPTION_KEY must be set for decryption');
  }

  const iv = data.subarray(0, 16);
  const tag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
