"use client";

import { WarTable } from "./WarTable";
import { WarBettingPanel } from "./WarBettingPanel";
import { WarGameStatus } from "./WarGameStatus";

export function WarLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <WarTable />
        <WarGameStatus />
      </div>
      <div>
        <WarBettingPanel />
      </div>
    </div>
  );
}

export default WarLayout;
