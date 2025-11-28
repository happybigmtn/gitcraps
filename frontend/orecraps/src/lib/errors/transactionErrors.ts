import { toast } from 'sonner';

/**
 * Centralized error handler for transaction-related errors
 * Provides user-friendly error messages for common Solana/wallet errors
 */
export function handleTransactionError(error: unknown, context: string): void {
  console.error(`${context} error:`, error);
  const errorMessage = error instanceof Error ? error.message : 'Unknown error';

  if (errorMessage.includes('User rejected') || errorMessage.includes('rejected the request')) {
    toast.error('Transaction cancelled');
    return;
  }

  if (errorMessage.includes('insufficient funds') || errorMessage.includes('Insufficient')) {
    toast.error('Insufficient SOL balance');
    return;
  }

  if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
    toast.error('Network rate limit. Please try again.');
    return;
  }

  if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
    toast.error('Transaction timed out. Please try again.');
    return;
  }

  toast.error(`${context} failed: ${errorMessage}`);
}

/**
 * Extract error message from various error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
