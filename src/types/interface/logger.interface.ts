/** Pino's API, so tests can mock the logger without mocking the pino module. */
export interface ILogger {
    debug: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    info: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    warn: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    error: (obj: unknown, msg?: string, ...args: unknown[]) => void;
    trace: (obj: unknown, msg?: string, ...args: unknown[]) => void;
}
