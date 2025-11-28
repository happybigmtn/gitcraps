import * as path from "path";
import * as fs from "fs";

export const CLI_PATH = path.resolve(process.cwd(), "../../target/release/ore-cli");
export const LOCALNET_RPC = "http://127.0.0.1:8899";
export const DEVNET_RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

export function getKeypairPath(): string {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error(
      "ADMIN_KEYPAIR_PATH environment variable is required. " +
      "Set it to the path of your admin keypair JSON file."
    );
  }
  return keypairPath;
}

export function getRpcEndpoint(network: string): string {
  return network === "localnet" ? LOCALNET_RPC : DEVNET_RPC;
}

/**
 * Validate that the admin keypair file exists and is readable
 * Call this during application startup to fail fast if configuration is incorrect
 *
 * @throws {Error} If ADMIN_KEYPAIR_PATH is not set
 * @throws {Error} If the keypair file does not exist
 * @throws {Error} If the keypair file is not readable
 */
export function validateKeypairFile(): void {
  const keypairPath = getKeypairPath();

  // Check if file exists
  if (!fs.existsSync(keypairPath)) {
    throw new Error(
      `Admin keypair file not found at: ${keypairPath}\n` +
      "Please ensure ADMIN_KEYPAIR_PATH points to a valid keypair JSON file."
    );
  }

  // Check if file is readable
  try {
    fs.accessSync(keypairPath, fs.constants.R_OK);
  } catch {
    throw new Error(
      `Admin keypair file is not readable: ${keypairPath}\n` +
      "Please check file permissions."
    );
  }

  // Optionally validate it's valid JSON
  try {
    const content = fs.readFileSync(keypairPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      throw new Error(
        `Invalid keypair format in ${keypairPath}\n` +
        "Expected a JSON array of 64 numbers (Solana keypair format)."
      );
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Admin keypair file contains invalid JSON: ${keypairPath}\n` +
        "Please ensure the file is a valid Solana keypair JSON file."
      );
    }
    // Re-throw our own errors and other errors
    throw error;
  }
}
