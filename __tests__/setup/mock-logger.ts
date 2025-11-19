/**
 * Centralized logger mock for all tests
 *
 * Usage:
 * 1. Import at the top of your test file (before other imports):
 *    import '../setup/mock-logger';
 *
 * 2. Or use the setupMockLogger function for more control:
 *    import { setupMockLogger, mockLogger } from '../setup/mock-logger';
 *
 *    beforeEach(() => {
 *      setupMockLogger();
 *    });
 */

// Create the mock logger instance
export const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
};

// Mock the logger module
jest.mock('../../src/logger', () => ({
    logger: mockLogger,
}));

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
