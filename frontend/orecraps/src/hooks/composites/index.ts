/**
 * Composite Hooks
 *
 * These hooks combine multiple individual hooks to reduce coupling and provide
 * convenient, domain-specific interfaces for components.
 *
 * Benefits:
 * - Reduced coupling: Components import fewer hooks
 * - Better encapsulation: Related state and logic grouped together
 * - Backward compatibility: Individual hook values are re-exported
 * - Convenience methods: Combined operations across multiple concerns
 * - Type safety: Fully typed with TypeScript
 */

export { useGameSession } from "./useGameSession";
export type { GameSession, BoardState, RoundState, NetworkType } from "./useGameSession";

export { useBetting } from "./useBetting";
export type {
  BettingSession,
  PendingBet,
  PlaceBetOptions,
  CrapsGame,
  CrapsPosition,
  CrapsState,
  CrapsBetType,
} from "./useBetting";
