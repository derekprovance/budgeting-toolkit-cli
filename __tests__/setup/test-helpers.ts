/**
 * Shared test helpers and assertion utilities
 *
 * Provides common testing patterns, assertion helpers, and utilities
 * to make tests more readable and maintainable.
 */

/**
 * Wait for a specified number of milliseconds
 * Useful for testing async behavior
 */
export const wait = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Assert that a promise rejects with a specific error message
 */
export const expectToRejectWith = async (
    promise: Promise<unknown>,
    expectedMessage: string | RegExp,
): Promise<void> => {
    await expect(promise).rejects.toThrow(expectedMessage);
};

/**
 * Assert that a mock function was called with partial arguments
 * Useful when you only care about specific arguments
 */
export const expectToHaveBeenCalledWithPartial = <T extends unknown[]>(
    mockFn: jest.Mock,
    ...partialArgs: Partial<T>
): void => {
    const calls = mockFn.mock.calls;
    const found = calls.some(callArgs => {
        return partialArgs.every((expected, index) => {
            if (expected === undefined) return true;
            const actual = callArgs[index];
            if (typeof expected === 'object' && expected !== null) {
                return JSON.stringify(actual).includes(JSON.stringify(expected));
            }
            return actual === expected;
        });
    });

    if (!found) {
        throw new Error(
            `Expected mock to have been called with partial args ${JSON.stringify(partialArgs)}\n` +
            `Actual calls: ${JSON.stringify(calls, null, 2)}`
        );
    }
};

/**
 * Create a spy on console methods (error, warn, log)
 * Returns cleanup function to restore original console
 */
export const spyOnConsole = (): {
    error: jest.SpyInstance;
    warn: jest.SpyInstance;
    log: jest.SpyInstance;
    restore: () => void;
} => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const logSpy = jest.spyOn(console, 'log').mockImplementation();

    return {
        error: errorSpy,
        warn: warnSpy,
        log: logSpy,
        restore: () => {
            errorSpy.mockRestore();
            warnSpy.mockRestore();
            logSpy.mockRestore();
        },
    };
};

/**
 * Suppress console output during a test (useful for tests that intentionally log errors)
 */
export const suppressConsole = (): { restore: () => void } => {
    const original = {
        error: console.error,
        warn: console.warn,
        log: console.log,
    };

    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();

    return {
        restore: () => {
            console.error = original.error;
            console.warn = original.warn;
            console.log = original.log;
        },
    };
};

/**
 * Deep clone an object (useful for creating test data variations)
 */
export const deepClone = <T>(obj: T): T => {
    return JSON.parse(JSON.stringify(obj));
};

/**
 * Create a mock date for testing time-dependent code
 * Returns cleanup function to restore real Date
 */
export const mockDate = (isoDate: string): { restore: () => void } => {
    const RealDate = Date;
    const mockedDate = new Date(isoDate);

    // @ts-expect-error - mocking global Date
    global.Date = class extends RealDate {
        constructor(...args: unknown[]) {
            if (args.length === 0) {
                super(isoDate);
            } else {
                // @ts-expect-error - dynamic args
                super(...args);
            }
        }

        static now(): number {
            return mockedDate.getTime();
        }
    };

    return {
        restore: () => {
            global.Date = RealDate;
        },
    };
};

/**
 * Assert that two arrays contain the same elements (order doesn't matter)
 */
export const expectArraysToHaveSameElements = <T>(
    actual: T[],
    expected: T[],
    compareFn?: (a: T, b: T) => boolean,
): void => {
    expect(actual.length).toBe(expected.length);

    const compare = compareFn || ((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b));

    expected.forEach(expectedItem => {
        const found = actual.some(actualItem => compare(actualItem, expectedItem));
        if (!found) {
            throw new Error(
                `Expected array to contain ${JSON.stringify(expectedItem)}\n` +
                `Actual array: ${JSON.stringify(actual, null, 2)}`
            );
        }
    });
};

/**
 * Assert that a number is within a range (inclusive)
 */
export const expectToBeWithinRange = (actual: number, min: number, max: number): void => {
    expect(actual).toBeGreaterThanOrEqual(min);
    expect(actual).toBeLessThanOrEqual(max);
};

/**
 * Assert that a value matches a partial object structure
 */
export const expectToMatchPartial = <T extends Record<string, unknown>>(
    actual: T,
    partial: Partial<T>,
): void => {
    Object.keys(partial).forEach(key => {
        expect(actual[key]).toEqual(partial[key]);
    });
};

/**
 * Create a resolved promise (useful for mocking async functions)
 */
export const resolvedPromise = <T>(value: T): Promise<T> => {
    return Promise.resolve(value);
};

/**
 * Create a rejected promise (useful for mocking async functions)
 */
export const rejectedPromise = (error: Error | string): Promise<never> => {
    return Promise.reject(typeof error === 'string' ? new Error(error) : error);
};
