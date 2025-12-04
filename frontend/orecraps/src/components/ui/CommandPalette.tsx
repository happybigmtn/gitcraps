"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Dices, Target, Spade, Diamond, Circle, Swords, Dice1, Play, Tv, Crown, Grid3X3, Bot, BarChart3, Wallet, RefreshCw, Settings, ChevronRight, ArrowLeft, DollarSign, CheckCircle, Gift, ArrowUp, ArrowDown, Rocket } from "lucide-react";

export interface CommandAction {
  id: string;
  label: string;
  shortcut?: string;
  icon?: React.ReactNode;
  category: string;
  action: () => void;
  hasSubmenu?: boolean;
}

// Game-specific contextual actions
type GameContext = string | null;

interface GameContextAction {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  description?: string;
}

// Context-specific actions for each game
const GAME_CONTEXT_ACTIONS: Record<string, GameContextAction[]> = {
  mine: [
    { id: "deploy", label: "Deploy RNG", shortcut: "Enter", icon: <Rocket className="h-4 w-4" />, description: "Deploy RNG to selected squares" },
    { id: "select_all", label: "Select All Squares", shortcut: "A", icon: <Grid3X3 className="h-4 w-4" />, description: "Select all 36 squares" },
    { id: "clear", label: "Clear Selection", shortcut: "Esc", icon: <ArrowLeft className="h-4 w-4" />, description: "Clear all selected squares" },
    { id: "roll", label: "Roll Dice (Settle)", shortcut: "R", icon: <Dices className="h-4 w-4" />, description: "Roll dice to settle round" },
  ],
  craps: [
    { id: "bet", label: "Place Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Open craps betting menu" },
    { id: "settle", label: "Settle Bets", shortcut: "S", icon: <CheckCircle className="h-4 w-4" />, description: "Settle all active bets" },
    { id: "roll", label: "Roll Dice", shortcut: "R", icon: <Dices className="h-4 w-4" />, description: "Roll the dice" },
    { id: "claim", label: "Claim Winnings", shortcut: "C", icon: <Gift className="h-4 w-4" />, description: "Claim any unclaimed winnings" },
  ],
  blackjack: [
    { id: "bet", label: "Place Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Bet on blackjack hand" },
    { id: "hit", label: "Hit", shortcut: "H", icon: <ArrowUp className="h-4 w-4" />, description: "Take another card" },
    { id: "stand", label: "Stand", shortcut: "S", icon: <ArrowDown className="h-4 w-4" />, description: "Keep current hand" },
    { id: "double", label: "Double Down", shortcut: "D", icon: <DollarSign className="h-4 w-4" />, description: "Double bet and take one card" },
  ],
  baccarat: [
    { id: "bet_player", label: "Bet Player", shortcut: "P", icon: <DollarSign className="h-4 w-4" />, description: "Bet on player hand" },
    { id: "bet_banker", label: "Bet Banker", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Bet on banker hand" },
    { id: "bet_tie", label: "Bet Tie", shortcut: "T", icon: <DollarSign className="h-4 w-4" />, description: "Bet on tie" },
    { id: "deal", label: "Deal Cards", shortcut: "D", icon: <Spade className="h-4 w-4" />, description: "Deal the cards" },
  ],
  roulette: [
    { id: "bet", label: "Place Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Open roulette betting menu" },
    { id: "spin", label: "Spin Wheel", shortcut: "S", icon: <Circle className="h-4 w-4" />, description: "Spin the roulette wheel" },
    { id: "clear", label: "Clear Bets", shortcut: "C", icon: <ArrowLeft className="h-4 w-4" />, description: "Clear all bets" },
  ],
  war: [
    { id: "bet", label: "Place Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Bet on casino war" },
    { id: "deal", label: "Deal Cards", shortcut: "D", icon: <Swords className="h-4 w-4" />, description: "Deal the cards" },
  ],
  sicbo: [
    { id: "bet", label: "Place Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Open sic bo betting menu" },
    { id: "roll", label: "Roll Dice", shortcut: "R", icon: <Dice1 className="h-4 w-4" />, description: "Roll the three dice" },
  ],
  threecard: [
    { id: "ante", label: "Ante Bet", shortcut: "A", icon: <DollarSign className="h-4 w-4" />, description: "Place ante bet" },
    { id: "play", label: "Play", shortcut: "P", icon: <Play className="h-4 w-4" />, description: "Play your hand" },
    { id: "fold", label: "Fold", shortcut: "F", icon: <ArrowDown className="h-4 w-4" />, description: "Fold and lose ante" },
  ],
  videopoker: [
    { id: "bet", label: "Place Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Set bet amount" },
    { id: "deal", label: "Deal/Draw", shortcut: "D", icon: <Tv className="h-4 w-4" />, description: "Deal or draw cards" },
    { id: "hold", label: "Hold Cards", shortcut: "1-5", icon: <CheckCircle className="h-4 w-4" />, description: "Toggle hold on cards" },
  ],
  uth: [
    { id: "ante", label: "Ante/Blind", shortcut: "A", icon: <DollarSign className="h-4 w-4" />, description: "Place ante and blind bets" },
    { id: "check", label: "Check", shortcut: "C", icon: <ArrowDown className="h-4 w-4" />, description: "Check (no bet)" },
    { id: "bet", label: "Bet", shortcut: "B", icon: <DollarSign className="h-4 w-4" />, description: "Place play bet" },
    { id: "fold", label: "Fold", shortcut: "F", icon: <ArrowLeft className="h-4 w-4" />, description: "Fold your hand" },
  ],
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions?: CommandAction[];
  onGameChange?: (game: string) => void;
  onBetMenuOpen?: () => void;
  onGameAction?: (game: string, action: string) => void;
}

// Default game navigation actions
const DEFAULT_GAME_ACTIONS: Omit<CommandAction, "action">[] = [
  { id: "mine", label: "Mine (RNG Mining)", shortcut: "Ctrl+1", icon: <Grid3X3 className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "craps", label: "Craps", shortcut: "Ctrl+2", icon: <Target className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "blackjack", label: "Blackjack", shortcut: "Ctrl+3", icon: <Spade className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "baccarat", label: "Baccarat", shortcut: "Ctrl+4", icon: <Diamond className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "roulette", label: "Roulette", shortcut: "Ctrl+5", icon: <Circle className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "war", label: "Casino War", shortcut: "Ctrl+6", icon: <Swords className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "sicbo", label: "Sic Bo", shortcut: "Ctrl+7", icon: <Dice1 className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "threecard", label: "Three Card Poker", shortcut: "Ctrl+8", icon: <Play className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "videopoker", label: "Video Poker", shortcut: "Ctrl+9", icon: <Tv className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "uth", label: "Ultimate Texas Hold'em", shortcut: "Ctrl+0", icon: <Crown className="h-4 w-4" />, category: "Games", hasSubmenu: true },
  { id: "bots", label: "Bot Simulation", shortcut: "B", icon: <Bot className="h-4 w-4" />, category: "Tools" },
  { id: "stats", label: "Statistics", shortcut: "S", icon: <BarChart3 className="h-4 w-4" />, category: "Tools" },
];

const DEFAULT_ACTION_ITEMS: Omit<CommandAction, "action">[] = [
  { id: "roll", label: "Roll Dice", shortcut: "R", icon: <Dices className="h-4 w-4" />, category: "Actions" },
  { id: "bet", label: "Open Bet Menu", shortcut: "B", icon: <Target className="h-4 w-4" />, category: "Actions" },
  { id: "wallet", label: "Connect Wallet", shortcut: "W", icon: <Wallet className="h-4 w-4" />, category: "Actions" },
  { id: "refresh", label: "Refresh Data", shortcut: "Ctrl+R", icon: <RefreshCw className="h-4 w-4" />, category: "Actions" },
  { id: "settings", label: "Settings", shortcut: "Ctrl+,", icon: <Settings className="h-4 w-4" />, category: "Settings" },
];

export function CommandPalette({ open, onOpenChange, actions = [], onGameChange, onBetMenuOpen, onGameAction }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [gameContext, setGameContext] = useState<GameContext>(null);

  // Reset context when dialog closes
  useEffect(() => {
    if (!open) {
      setGameContext(null);
      setSearch("");
    }
  }, [open]);

  // Get game label for breadcrumb
  const gameLabel = useMemo(() => {
    if (!gameContext) return null;
    const game = DEFAULT_GAME_ACTIONS.find(g => g.id === gameContext);
    return game?.label || gameContext;
  }, [gameContext]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    setGameContext(null);
    setSearch("");
  }, []);

  // Build full action list for root menu
  const allActions = useMemo(() => {
    const gameActions: CommandAction[] = DEFAULT_GAME_ACTIONS.map((item) => ({
      ...item,
      action: () => {
        if (item.hasSubmenu && GAME_CONTEXT_ACTIONS[item.id]) {
          // Enter game context submenu
          setGameContext(item.id);
          setSearch("");
        } else {
          // Direct navigation for non-game items
          onGameChange?.(item.id);
          onOpenChange(false);
        }
      },
    }));

    const defaultActions: CommandAction[] = DEFAULT_ACTION_ITEMS.map((item) => ({
      ...item,
      action: () => {
        if (item.id === "bet") {
          onBetMenuOpen?.();
        }
        onOpenChange(false);
      },
    }));

    return [...gameActions, ...defaultActions, ...actions];
  }, [actions, onGameChange, onBetMenuOpen, onOpenChange]);

  // Get context-specific actions when in a game context
  const contextActions = useMemo(() => {
    if (!gameContext) return null;
    return GAME_CONTEXT_ACTIONS[gameContext] || [];
  }, [gameContext]);

  // Group actions by category for root menu
  const groupedActions = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {};
    allActions.forEach((action) => {
      if (!groups[action.category]) {
        groups[action.category] = [];
      }
      groups[action.category].push(action);
    });
    return groups;
  }, [allActions]);

  // Filter actions based on search (for root menu)
  const filteredGroups = useMemo(() => {
    if (!search) return groupedActions;

    const filtered: Record<string, CommandAction[]> = {};
    Object.entries(groupedActions).forEach(([category, actions]) => {
      const matchingActions = actions.filter(
        (action) =>
          action.label.toLowerCase().includes(search.toLowerCase()) ||
          action.id.toLowerCase().includes(search.toLowerCase())
      );
      if (matchingActions.length > 0) {
        filtered[category] = matchingActions;
      }
    });
    return filtered;
  }, [groupedActions, search]);

  // Filter context actions based on search
  const filteredContextActions = useMemo(() => {
    if (!contextActions) return [];
    if (!search) return contextActions;
    return contextActions.filter(
      (action) =>
        action.label.toLowerCase().includes(search.toLowerCase()) ||
        action.id.toLowerCase().includes(search.toLowerCase())
    );
  }, [contextActions, search]);

  // Handle context action selection
  const handleContextAction = useCallback((actionId: string) => {
    if (!gameContext) return;

    // Special handling for common actions
    if (actionId === "bet" && gameContext === "craps") {
      onGameChange?.(gameContext); // Switch to game tab first
      onBetMenuOpen?.(); // Open bet menu
      onOpenChange(false);
      return;
    }

    // Notify parent of game-specific action
    onGameAction?.(gameContext, actionId);
    onGameChange?.(gameContext); // Switch to game tab
    onOpenChange(false);
  }, [gameContext, onGameChange, onBetMenuOpen, onGameAction, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-lg">
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
          {/* Search input with breadcrumb */}
          <div className="flex items-center border-b px-3">
            {gameContext ? (
              <button
                onClick={handleBack}
                className="mr-2 p-1 hover:bg-accent rounded transition-colors"
                aria-label="Go back"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            )}
            {gameContext && (
              <span className="text-sm text-muted-foreground mr-2 font-medium">
                {gameLabel} /
              </span>
            )}
            <CommandInput
              placeholder={gameContext ? "Search actions..." : "Type a command or search..."}
              value={search}
              onValueChange={setSearch}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <CommandList className="max-h-[400px] overflow-y-auto">
            <CommandEmpty>No results found.</CommandEmpty>

            {/* Context-specific actions when in a game */}
            {gameContext && filteredContextActions.length > 0 ? (
              <CommandGroup heading={`${gameLabel} Actions`}>
                {filteredContextActions.map((action) => (
                  <CommandItem
                    key={action.id}
                    value={action.id}
                    onSelect={() => handleContextAction(action.id)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {action.icon}
                      <div className="flex flex-col">
                        <span>{action.label}</span>
                        {action.description && (
                          <span className="text-xs text-muted-foreground">{action.description}</span>
                        )}
                      </div>
                    </div>
                    {action.shortcut && (
                      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                        {action.shortcut}
                      </kbd>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : !gameContext ? (
              /* Root menu - show all games and actions */
              Object.entries(filteredGroups).map(([category, actions]) => (
                <CommandGroup key={category} heading={category}>
                  {actions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => action.action()}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {action.icon}
                        <span>{action.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {action.shortcut && (
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                            {action.shortcut}
                          </kbd>
                        )}
                        {action.hasSubmenu && (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
