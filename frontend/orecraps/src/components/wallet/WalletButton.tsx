"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Wallet, LogOut, Copy, ExternalLink, Zap } from "lucide-react";
import { truncateAddress } from "@/lib/solana";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function WalletButton() {
  const { publicKey, disconnect, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();

  const handleConnect = () => {
    setVisible(true);
  };

  const handleCopyAddress = async () => {
    if (publicKey) {
      await navigator.clipboard.writeText(publicKey.toBase58());
      toast.success("Address copied to clipboard");
    }
  };

  const handleViewExplorer = () => {
    if (publicKey) {
      const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
      const explorerUrl = `https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=${network}`;
      window.open(explorerUrl, "_blank");
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    toast.success("Wallet disconnected");
  };

  if (!connected) {
    return (
      <Button
        onClick={handleConnect}
        disabled={connecting}
        size="sm"
        className={cn(
          "h-8 px-3 font-mono text-xs",
          "bg-primary text-primary-foreground",
          "hover:bg-foreground hover:text-background"
        )}
      >
        <Zap className="h-3.5 w-3.5" />
        <span className="ml-1.5">
          {connecting ? "CONNECTING" : "CONNECT"}
        </span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 font-mono text-xs border-[oklch(0.75_0.2_145)] text-[oklch(0.75_0.2_145)] hover:bg-[oklch(0.75_0.2_145/0.1)]"
        >
          <div className="w-2 h-2 rounded-full bg-[oklch(0.75_0.2_145)] mr-2 animate-pulse" />
          {publicKey && truncateAddress(publicKey.toBase58())}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 font-mono text-xs">
        <DropdownMenuItem onClick={handleCopyAddress} className="cursor-pointer">
          <Copy className="mr-2 h-3.5 w-3.5" />
          COPY ADDRESS
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleViewExplorer} className="cursor-pointer">
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          VIEW ON EXPLORER
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDisconnect} className="text-destructive cursor-pointer">
          <LogOut className="mr-2 h-3.5 w-3.5" />
          DISCONNECT
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
