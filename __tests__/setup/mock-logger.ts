/**
 * Injectable mock logger.
 *
 * This is a plain object, not a module mock: under native ESM `jest.mock` is
 * inert (see __tests__/meta/esm-mocking.test.ts), so the real `src/logger.js`
 * is always what a service imports by default. Pass `mockLogger` through the
 * service's constructor (services that log accept an `ILogger`) to
 * assert on log calls. The real logger is kept quiet by LOG_LEVEL=silent in
 * __tests__/setup/env.ts.
 */

import { jest } from '@jest/globals';

type LogFn = (obj: unknown, msg?: string) => void;

export const mockLogger = {
    debug: jest.fn<LogFn>(),
    info: jest.fn<LogFn>(),
    warn: jest.fn<LogFn>(),
    error: jest.fn<LogFn>(),
    trace: jest.fn<LogFn>(),
};

/**
 * Reset all logger mocks (useful in beforeEach)
 */
export const resetMockLogger = (): void => {
    mockLogger.debug.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.trace.mockClear();
};

/**
 * Setup mock logger (combines reset with any additional setup)
 */
export const setupMockLogger = (): void => {
    resetMockLogger();
};

/**
 * Get all logger calls across all log levels
 */
export const getAllLoggerCalls = (): Array<{ level: string; args: unknown[] }> => {
    const calls: Array<{ level: string; args: unknown[] }> = [];

    (Object.keys(mockLogger) as Array<keyof typeof mockLogger>).forEach(level => {
        const mock = mockLogger[level];
        mock.mock.calls.forEach(args => {
            calls.push({ level, args });
        });
    });

    return calls;
};

/**
 * Assert that logger was called with specific message
 */
export const expectLoggerToHaveBeenCalledWith = (
    level: keyof typeof mockLogger,
    message: string | RegExp
): void => {
    const calls = mockLogger[level].mock.calls;
    const found = calls.some(callArgs => {
        const firstArg = callArgs[0];
        if (typeof message === 'string') {
            return firstArg === message;
        }
        return message.test(String(firstArg));
    });

    if (!found) {
        throw new Error(
            `Expected logger.${level} to have been called with "${message}", but it wasn't.\n` +
                `Actual calls: ${JSON.stringify(calls, null, 2)}`
        );
    }
};
