"use client";

import { useState, useEffect } from "react";
import { useNetworkStore, NetworkType } from "@/store/networkStore";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Globe, Server, ChevronDown, Check, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function NetworkToggle() {
  const { network, isLocalnetRunning, setNetwork, setLocalnetRunning } = useNetworkStore();
  const [checking, setChecking] = useState(false);

  // Check localnet status when switching to it
  const checkLocalnet = async () => {
    setChecking(true);
    try {
      const response = await fetch("http://127.0.0.1:8899", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getHealth",
        }),
      });
      const data = await response.json();
      setLocalnetRunning(data.result === "ok");
    } catch {
      setLocalnetRunning(false);
    } finally {
      setChecking(false);
    }
  };

  // Check localnet on mount
  useEffect(() => {
    checkLocalnet();
  }, []);

  const handleNetworkChange = (newNetwork: NetworkType) => {
    // setNetwork already calls setNetworkMode internally
    setNetwork(newNetwork);
    if (newNetwork === "localnet") {
      checkLocalnet();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-2">
          {network === "localnet" ? (
            <Server className="h-4 w-4" />
          ) : (
            <Globe className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {network === "localnet" ? "Localnet" : "Devnet"}
          </span>
          {network === "localnet" && (
            <Badge
              variant={isLocalnetRunning ? "default" : "destructive"}
              className="h-4 px-1 text-[10px]"
            >
              {checking ? (
                <Loader2 className="h-2 w-2 animate-spin" />
              ) : isLocalnetRunning ? (
                "Live"
              ) : (
                "Off"
              )}
            </Badge>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => handleNetworkChange("devnet")}
          className={cn("gap-2", network === "devnet" && "bg-secondary")}
        >
          <Globe className="h-4 w-4" />
          <div className="flex flex-col">
            <span>Devnet</span>
            <span className="text-[10px] text-muted-foreground">
              Public testnet
            </span>
          </div>
          {network === "devnet" && <Check className="h-4 w-4 ml-auto" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleNetworkChange("localnet")}
          className={cn("gap-2", network === "localnet" && "bg-secondary")}
        >
          <Server className="h-4 w-4" />
          <div className="flex flex-col">
            <span className="flex items-center gap-1">
              Localnet
              {!isLocalnetRunning && (
                <AlertCircle className="h-3 w-3 text-destructive" />
              )}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Local validator
            </span>
          </div>
          {network === "localnet" && <Check className="h-4 w-4 ml-auto" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
