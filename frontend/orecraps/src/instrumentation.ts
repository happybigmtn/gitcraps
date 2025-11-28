/**
 * Next.js Instrumentation - Server startup hook
 *
 * This file is automatically executed by Next.js when the server starts.
 * We use it to validate critical environment configuration before accepting requests.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import { validateKeypairFile } from './lib/cliConfig';

export async function register() {
  // Only run validation on server-side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Skip validation in production if ADMIN_KEYPAIR_PATH is not set
      // (production might use ADMIN_KEYPAIR instead)
      if (process.env.ADMIN_KEYPAIR_PATH) {
        console.log('[Startup] Validating admin keypair configuration...');
        validateKeypairFile();
        console.log('[Startup] Admin keypair validation successful');
      } else {
        console.log('[Startup] ADMIN_KEYPAIR_PATH not set, skipping file validation');
      }
    } catch (error) {
      // Log the error but don't crash the server
      // This allows the app to start and show proper error messages in API routes
      console.error('[Startup] Admin keypair validation failed:', error instanceof Error ? error.message : error);
      console.error('[Startup] API routes requiring admin keypair will fail until this is fixed');
    }
  }
}
