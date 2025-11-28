/**
 * Shared utilities for Zustand stores
 * Provides consistent patterns for async state management
 */


/**
 * Standard async operation state
 */
export interface AsyncState {
  isLoading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

/**
 * Create initial async state
 */
export const initialAsyncState: AsyncState = {
  isLoading: false,
  error: null,
  lastUpdated: null,
};

/**
 * Helper to set loading state
 */
export const setLoading = <T extends AsyncState>(state: T): Partial<T> => ({
  ...state,
  isLoading: true,
  error: null,
} as Partial<T>);

/**
 * Helper to set success state
 */
export const setSuccess = <T extends AsyncState>(state: T): Partial<T> => ({
  ...state,
  isLoading: false,
  error: null,
  lastUpdated: Date.now(),
} as Partial<T>);

/**
 * Helper to set error state
 */
export const setError = <T extends AsyncState>(state: T, error: string): Partial<T> => ({
  ...state,
  isLoading: false,
  error,
} as Partial<T>);

/**
 * Wrapper for async operations with automatic loading/error handling
 */
export async function withAsyncState<T>(
  setPartial: (partial: Partial<AsyncState>) => void,
  operation: () => Promise<T>
): Promise<T | null> {
  setPartial({ isLoading: true, error: null });
  try {
    const result = await operation();
    setPartial({ isLoading: false, error: null, lastUpdated: Date.now() });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Operation failed';
    setPartial({ isLoading: false, error: message });
    return null;
  }
}

/**
 * Check if data is stale (older than maxAge ms)
 */
export function isStale(lastUpdated: number | null, maxAge: number = 30000): boolean {
  if (!lastUpdated) return true;
  return Date.now() - lastUpdated > maxAge;
}
