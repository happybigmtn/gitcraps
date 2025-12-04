"use client";

import { VideoPokerTable } from "./VideoPokerTable";
import { VideoPokerBettingPanel } from "./VideoPokerBettingPanel";
import { VideoPokerGameStatus } from "./VideoPokerGameStatus";
import { useVideoPoker } from "@/hooks/useVideoPoker";

export function VideoPokerLayout() {
  // Hook to fetch video poker data from on-chain
  useVideoPoker();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <VideoPokerTable />
        <VideoPokerGameStatus />
      </div>
      <div>
        <VideoPokerBettingPanel />
      </div>
    </div>
  );
}

export default VideoPokerLayout;
