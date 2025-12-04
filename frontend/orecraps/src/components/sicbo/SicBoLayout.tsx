"use client";

import { SicBoTable } from "./SicBoTable";
import { SicBoBettingPanel } from "./SicBoBettingPanel";
import { SicBoGameStatus } from "./SicBoGameStatus";

export function SicBoLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <SicBoTable />
        <SicBoGameStatus />
      </div>
      <div>
        <SicBoBettingPanel />
      </div>
    </div>
  );
}

export default SicBoLayout;
