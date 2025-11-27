// lib/debug.ts
type DebugFn = (...args: unknown[]) => void;

export const createDebugger = (namespace: string): DebugFn => {
  return (...args: unknown[]) => {
    if (process.env.NODE_ENV === "development") {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
      console.log(`[${timestamp}] [${namespace}]`, ...args);
    }
  };
};

// Optional: log levels
export const createLogger = (namespace: string) => ({
  debug: createDebugger(namespace),
  info: (...args: unknown[]) => console.log(`[${namespace}]`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${namespace}]`, ...args),
  error: (...args: unknown[]) => console.error(`[${namespace}]`, ...args),
});
