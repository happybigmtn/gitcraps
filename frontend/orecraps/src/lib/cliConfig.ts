import * as path from "path";

export const CLI_PATH = path.resolve(process.cwd(), "../../target/release/ore-cli");
export const LOCALNET_RPC = "http://127.0.0.1:8899";
export const DEVNET_RPC = process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com";

export function getKeypairPath(): string {
  const keypairPath = process.env.ADMIN_KEYPAIR_PATH;
  if (!keypairPath) {
    throw new Error("ADMIN_KEYPAIR_PATH environment variable is required");
  }
  return keypairPath;
}

export function getRpcEndpoint(network: string): string {
  return network === "localnet" ? LOCALNET_RPC : DEVNET_RPC;
}
