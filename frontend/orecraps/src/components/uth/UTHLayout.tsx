"use client";

import { UTHTable } from "./UTHTable";
import { UTHBettingPanel } from "./UTHBettingPanel";
import { UTHGameStatus } from "./UTHGameStatus";

export function UTHLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <UTHTable />
        <UTHGameStatus />
      </div>
      <div>
        <UTHBettingPanel />
      </div>
    </div>
  );
}

export default UTHLayout;
