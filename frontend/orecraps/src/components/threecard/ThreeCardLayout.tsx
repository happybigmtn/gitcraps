"use client";

import { ThreeCardTable } from "./ThreeCardTable";
import { ThreeCardBettingPanel } from "./ThreeCardBettingPanel";
import { ThreeCardGameStatus } from "./ThreeCardGameStatus";

export function ThreeCardLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <ThreeCardTable />
        <ThreeCardGameStatus />
      </div>
      <div>
        <ThreeCardBettingPanel />
      </div>
    </div>
  );
}

export default ThreeCardLayout;
