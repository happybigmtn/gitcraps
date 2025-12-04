"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Target, Circle, Square, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  Flame, Crown, Trophy, Zap, ArrowUp, ArrowDown, Check, X
} from "lucide-react";

export type BetCategory = "basic" | "simple" | "bonus";

export interface BetType {
  id: string;
  label: string;
  shortcut?: string;
  description: string;
  category: BetCategory;
  icon?: React.ReactNode;
  odds?: string;
  houseEdge?: string;
  requiresPoint?: boolean;
  comeOutOnly?: boolean;
}

// Craps bet definitions
const CRAPS_BETS: BetType[] = [
  // Basic bets
  { id: "pass", label: "Pass Line", shortcut: "P", description: "Win on 7/11, lose on 2/3/12, then hit point before 7", category: "basic", icon: <ArrowUp className="h-4 w-4" />, odds: "1:1", houseEdge: "1.41%" },
  { id: "dont_pass", label: "Don't Pass", shortcut: "D", description: "Opposite of Pass Line, bar 12", category: "basic", icon: <ArrowDown className="h-4 w-4" />, odds: "1:1", houseEdge: "1.36%" },
  { id: "come", label: "Come", shortcut: "C", description: "Like Pass Line but placed after point established", category: "basic", icon: <ArrowUp className="h-4 w-4" />, odds: "1:1", houseEdge: "1.41%", requiresPoint: true },
  { id: "dont_come", label: "Don't Come", shortcut: "Shift+C", description: "Like Don't Pass but placed after point established", category: "basic", icon: <ArrowDown className="h-4 w-4" />, odds: "1:1", houseEdge: "1.36%", requiresPoint: true },
  { id: "field", label: "Field", shortcut: "F", description: "Win on 2,3,4,9,10,11,12 (2x on 2/12)", category: "basic", icon: <Square className="h-4 w-4" />, odds: "1:1", houseEdge: "5.56%" },
  { id: "hard4", label: "Hard 4", shortcut: "4", description: "2+2 before 7 or easy 4", category: "basic", icon: <Dice2 className="h-4 w-4" />, odds: "7:1", houseEdge: "11.11%" },
  { id: "hard6", label: "Hard 6", shortcut: "6", description: "3+3 before 7 or easy 6", category: "basic", icon: <Dice3 className="h-4 w-4" />, odds: "9:1", houseEdge: "9.09%" },
  { id: "hard8", label: "Hard 8", shortcut: "8", description: "4+4 before 7 or easy 8", category: "basic", icon: <Dice4 className="h-4 w-4" />, odds: "9:1", houseEdge: "9.09%" },
  { id: "hard10", label: "Hard 10", shortcut: "0", description: "5+5 before 7 or easy 10", category: "basic", icon: <Dice5 className="h-4 w-4" />, odds: "7:1", houseEdge: "11.11%" },

  // Simple bets (True odds - 0% house edge)
  { id: "yes_4", label: "Yes 4", shortcut: "Y4", description: "True odds 4 hits before 7", category: "simple", icon: <Check className="h-4 w-4 text-green-500" />, odds: "2:1", houseEdge: "0%" },
  { id: "yes_5", label: "Yes 5", shortcut: "Y5", description: "True odds 5 hits before 7", category: "simple", icon: <Check className="h-4 w-4 text-green-500" />, odds: "3:2", houseEdge: "0%" },
  { id: "yes_6", label: "Yes 6", shortcut: "Y6", description: "True odds 6 hits before 7", category: "simple", icon: <Check className="h-4 w-4 text-green-500" />, odds: "6:5", houseEdge: "0%" },
  { id: "yes_8", label: "Yes 8", shortcut: "Y8", description: "True odds 8 hits before 7", category: "simple", icon: <Check className="h-4 w-4 text-green-500" />, odds: "6:5", houseEdge: "0%" },
  { id: "yes_9", label: "Yes 9", shortcut: "Y9", description: "True odds 9 hits before 7", category: "simple", icon: <Check className="h-4 w-4 text-green-500" />, odds: "3:2", houseEdge: "0%" },
  { id: "yes_10", label: "Yes 10", shortcut: "Ya", description: "True odds 10 hits before 7", category: "simple", icon: <Check className="h-4 w-4 text-green-500" />, odds: "2:1", houseEdge: "0%" },
  { id: "no_4", label: "No 4", shortcut: "N4", description: "True odds 7 hits before 4", category: "simple", icon: <X className="h-4 w-4 text-red-500" />, odds: "1:2", houseEdge: "0%" },
  { id: "no_5", label: "No 5", shortcut: "N5", description: "True odds 7 hits before 5", category: "simple", icon: <X className="h-4 w-4 text-red-500" />, odds: "2:3", houseEdge: "0%" },
  { id: "no_6", label: "No 6", shortcut: "N6", description: "True odds 7 hits before 6", category: "simple", icon: <X className="h-4 w-4 text-red-500" />, odds: "5:6", houseEdge: "0%" },
  { id: "no_8", label: "No 8", shortcut: "N8", description: "True odds 7 hits before 8", category: "simple", icon: <X className="h-4 w-4 text-red-500" />, odds: "5:6", houseEdge: "0%" },
  { id: "no_9", label: "No 9", shortcut: "N9", description: "True odds 7 hits before 9", category: "simple", icon: <X className="h-4 w-4 text-red-500" />, odds: "2:3", houseEdge: "0%" },
  { id: "no_10", label: "No 10", shortcut: "Na", description: "True odds 7 hits before 10", category: "simple", icon: <X className="h-4 w-4 text-red-500" />, odds: "1:2", houseEdge: "0%" },
  { id: "next_any7", label: "Next 7", shortcut: "7", description: "Next roll is 7", category: "simple", icon: <Target className="h-4 w-4 text-blue-500" />, odds: "4:1", houseEdge: "16.67%" },
  { id: "next_any_craps", label: "Next Craps", shortcut: "Shift+7", description: "Next roll is 2, 3, or 12", category: "simple", icon: <Target className="h-4 w-4 text-blue-500" />, odds: "7:1", houseEdge: "11.11%" },
  { id: "next_eleven", label: "Next 11", shortcut: "B", description: "Next roll is 11", category: "simple", icon: <Target className="h-4 w-4 text-blue-500" />, odds: "15:1", houseEdge: "11.11%" },

  // Bonus bets (come-out roll only)
  { id: "fire", label: "Fire Bet", shortcut: "Shift+F", description: "Pays if shooter hits 4+ unique points", category: "bonus", icon: <Flame className="h-4 w-4 text-orange-500" />, odds: "25:1 to 1000:1", houseEdge: "20.65%", comeOutOnly: true },
  { id: "small", label: "Small", shortcut: "S", description: "Hit all small points (2,3,4,5,6) before 7", category: "bonus", icon: <Circle className="h-4 w-4 text-yellow-500" />, odds: "34:1", houseEdge: "7.76%", comeOutOnly: true },
  { id: "tall", label: "Tall", shortcut: "T", description: "Hit all tall numbers (8,9,10,11,12) before 7", category: "bonus", icon: <Crown className="h-4 w-4 text-purple-500" />, odds: "34:1", houseEdge: "7.76%", comeOutOnly: true },
  { id: "all", label: "All", shortcut: "A", description: "Hit all numbers 2-12 before 7", category: "bonus", icon: <Trophy className="h-4 w-4 text-amber-500" />, odds: "175:1", houseEdge: "7.76%", comeOutOnly: true },
  { id: "diff_doubles", label: "Different Doubles", shortcut: "Shift+D", description: "Roll all 6 doubles before 7-out", category: "bonus", icon: <Zap className="h-4 w-4 text-cyan-500" />, odds: "150:1", houseEdge: "13.89%", comeOutOnly: true },
  { id: "ride_the_line", label: "Ride the Line", shortcut: "Shift+R", description: "Pass line with progressive multiplier", category: "bonus", icon: <Zap className="h-4 w-4 text-pink-500" />, odds: "varies", houseEdge: "varies", comeOutOnly: true },
  { id: "mugsy", label: "Mugsy", shortcut: "M", description: "Shooter rolls 7 three times in a row", category: "bonus", icon: <Dice6 className="h-4 w-4 text-indigo-500" />, odds: "100:1", houseEdge: "varies", comeOutOnly: true },
  { id: "hot_hand", label: "Hot Hand", shortcut: "H", description: "Shooter makes 3+ passes in a row", category: "bonus", icon: <Flame className="h-4 w-4 text-red-500" />, odds: "varies", houseEdge: "varies", comeOutOnly: true },
  { id: "replay", label: "Replay", shortcut: "Shift+P", description: "Repeat the exact same roll", category: "bonus", icon: <Circle className="h-4 w-4 text-green-500" />, odds: "35:1", houseEdge: "2.78%", comeOutOnly: true },
];

interface BetMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBetSelect: (betType: BetType, amount: number) => void;
  currentPoint?: number | null;
  isComeOut?: boolean;
  defaultAmount?: number;
}

export function BetMenu({
  open,
  onOpenChange,
  onBetSelect,
  currentPoint,
  isComeOut = true,
  defaultAmount = 1
}: BetMenuProps) {
  const [selectedCategory, setSelectedCategory] = useState<BetCategory>("basic");
  const [amount, setAmount] = useState(defaultAmount);
  const [selectedBet, setSelectedBet] = useState<BetType | null>(null);

  // Filter bets by category and availability
  const filteredBets = useMemo(() => {
    return CRAPS_BETS.filter(bet => {
      if (bet.category !== selectedCategory) return false;
      if (bet.requiresPoint && isComeOut) return false;
      if (bet.comeOutOnly && !isComeOut) return false;
      return true;
    });
  }, [selectedCategory, isComeOut]);

  // Handle keyboard shortcuts within bet menu
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Amount controls
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAmount(prev => Math.min(prev + 1, 1000));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAmount(prev => Math.max(prev - 1, 1));
        return;
      }
      if (e.key === "Enter" && selectedBet) {
        e.preventDefault();
        onBetSelect(selectedBet, amount);
        onOpenChange(false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onOpenChange(false);
        return;
      }

      // Category shortcuts
      if (e.key === "1") {
        setSelectedCategory("basic");
        return;
      }
      if (e.key === "2") {
        setSelectedCategory("simple");
        return;
      }
      if (e.key === "3") {
        setSelectedCategory("bonus");
        return;
      }

      // Find matching bet by shortcut
      const key = e.shiftKey ? `Shift+${e.key.toUpperCase()}` : e.key.toUpperCase();
      const matchingBet = filteredBets.find(bet =>
        bet.shortcut?.toUpperCase() === key ||
        bet.shortcut?.toUpperCase() === e.key.toUpperCase()
      );

      if (matchingBet) {
        e.preventDefault();
        setSelectedBet(matchingBet);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredBets, selectedBet, amount, onBetSelect, onOpenChange]);

  const handleBetClick = useCallback((bet: BetType) => {
    setSelectedBet(bet);
  }, []);

  const handlePlaceBet = useCallback(() => {
    if (selectedBet) {
      onBetSelect(selectedBet, amount);
      onOpenChange(false);
    }
  }, [selectedBet, amount, onBetSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Place Bet
            {currentPoint && (
              <span className="text-sm text-muted-foreground ml-2">
                Point: {currentPoint}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as BetCategory)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="gap-1">
              <span className="text-xs text-muted-foreground">[1]</span> Basic
            </TabsTrigger>
            <TabsTrigger value="simple" className="gap-1">
              <span className="text-xs text-muted-foreground">[2]</span> Simple
            </TabsTrigger>
            <TabsTrigger value="bonus" className="gap-1">
              <span className="text-xs text-muted-foreground">[3]</span> Bonus
            </TabsTrigger>
          </TabsList>

          <TabsContent value={selectedCategory} className="mt-4">
            <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto">
              {filteredBets.map((bet) => (
                <button
                  key={bet.id}
                  onClick={() => handleBetClick(bet)}
                  className={cn(
                    "flex flex-col p-3 rounded-lg border text-left transition-colors",
                    selectedBet?.id === bet.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {bet.icon}
                      <span className="font-medium">{bet.label}</span>
                    </div>
                    {bet.shortcut && (
                      <kbd className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {bet.shortcut}
                      </kbd>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {bet.description}
                  </p>
                  <div className="flex gap-2 mt-2 text-xs">
                    <span className="text-green-600">Odds: {bet.odds}</span>
                    <span className={cn(
                      bet.houseEdge === "0%" ? "text-green-600" : "text-yellow-600"
                    )}>
                      Edge: {bet.houseEdge}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Amount and submit section */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Amount:</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setAmount(prev => Math.max(prev - 1, 1))}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-8 text-center"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setAmount(prev => Math.min(prev + 1, 1000))}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
            <span className="text-xs text-muted-foreground">(arrows)</span>
          </div>

          <div className="flex-1" />

          <Button
            onClick={handlePlaceBet}
            disabled={!selectedBet}
            className="gap-2"
          >
            Place Bet
            <kbd className="text-xs bg-primary-foreground/20 px-1.5 py-0.5 rounded">
              Enter
            </kbd>
          </Button>
        </div>

        {selectedBet && (
          <div className="mt-2 p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              {selectedBet.icon}
              <span className="font-medium">{selectedBet.label}</span>
              <span className="text-muted-foreground">×</span>
              <span className="font-mono">{amount}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedBet.description}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export { CRAPS_BETS };
