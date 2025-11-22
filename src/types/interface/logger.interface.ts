/**
 * Interface for logger operations
 * Provides a consistent logger interface across the application that matches Pino's API
 * This interface allows for easy mocking in tests without mocking the pino module
 */
export interface ILogger {
    debug: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    info: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    warn: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    error: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    trace: (obj: unknown, msg?: string, ...args: unknown[]) => void;
}
