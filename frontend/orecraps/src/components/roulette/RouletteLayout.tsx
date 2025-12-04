"use client";

import { RouletteTable } from "./RouletteTable";
import { RouletteBettingPanel } from "./RouletteBettingPanel";
import { RouletteGameStatus } from "./RouletteGameStatus";

export function RouletteLayout() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <RouletteTable />
        <RouletteGameStatus />
      </div>
      <div>
        <RouletteBettingPanel />
      </div>
    </div>
  );
}

export default RouletteLayout;
