"use client";

import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { useCrapsStore, useCanPlaceBet, getBetDisplayInfo } from '@/store/crapsStore';
import { CrapsBetType } from '@/lib/program';

interface BetButtonProps {
  betType: CrapsBetType;
  point?: number;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  variant?: 'outline' | 'default' | 'destructive' | 'secondary' | 'ghost' | 'link';
  className?: string;
}

export function BetButton({
  betType,
  point = 0,
  label,
  sublabel,
  icon,
  disabled,
  variant = 'outline',
  className = '',
}: BetButtonProps) {
  const store = useCrapsStore();
  const betCheck = useCanPlaceBet(betType, point);
  const canBet = betCheck && typeof betCheck === 'object' && 'canBet' in betCheck ? betCheck.canBet : false;
  const reason = betCheck && typeof betCheck === 'object' && 'reason' in betCheck && typeof betCheck.reason === 'string' ? betCheck.reason : undefined;
  const info = getBetDisplayInfo(betType, point);

  const handleClick = useCallback(() => {
    store.addPendingBet({
      betType,
      point,
      amount: store.betAmount,
    });
  }, [store, betType, point]);

  return (
    <Button
      variant={variant}
      className={`h-14 flex flex-col items-center justify-center ${className}`}
      onClick={handleClick}
      disabled={disabled || !canBet}
      title={reason || undefined}
    >
      {icon && <span className="mb-1">{icon}</span>}
      <span className="text-sm font-bold">{label}</span>
      <span className="text-[10px] text-muted-foreground">
        {sublabel || info.payout}
      </span>
    </Button>
  );
}

export default BetButton;
