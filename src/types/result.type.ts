/**
 * Result type for type-safe error handling without exceptions.
 * Uses discriminated union pattern for excellent TypeScript support.
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return { ok: false, error: 'Division by zero' };
 *   }
 *   return { ok: true, value: a / b };
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // 5
 * } else {
 *   console.error(result.error); // 'Division by zero'
 * }
 * ```
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Helper functions for creating Result types
 */
export const Result = {
    /**
     * Creates a successful Result containing a value
     */
    ok: <T, E = never>(value: T): Result<T, E> => ({ ok: true, value }),

    /**
     * Creates a failed Result containing an error
     */
    err: <T = never, E = unknown>(error: E): Result<T, E> => ({ ok: false, error }),

    /**
     * Returns the value if Ok, otherwise returns the provided default value
     */
    unwrapOr: <T, E>(result: Result<T, E>, defaultValue: T): T =>
        result.ok ? result.value : defaultValue,

    /**
     * Maps the value if Ok, otherwise returns the error unchanged
     */
    map: <T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> =>
        result.ok ? Result.ok(fn(result.value)) : result,

    /**
     * Maps the error if Err, otherwise returns the value unchanged
     */
    mapErr: <T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> =>
        result.ok ? result : Result.err(fn(result.error)),

    /**
     * Chains results together (flatMap)
     */
    andThen: <T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> =>
        result.ok ? fn(result.value) : result,
};

/**
 * Common error types for validation
 */
export interface ValidationError {
    field: string;
    message: string;
    userMessage: string; // User-friendly message to display
    details?: Record<string, unknown>;
}

export interface TransactionValidationError extends ValidationError {
    transactionId: string;
    transactionDescription: string;
}
