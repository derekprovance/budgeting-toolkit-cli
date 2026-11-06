export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const Result = {
    ok: <T, E = never>(value: T): Result<T, E> => ({ ok: true, value }),
    err: <T = never, E = unknown>(error: E): Result<T, E> => ({ ok: false, error }),
};

export interface ValidationError {
    field: string;
    message: string;
    userMessage: string;
    details?: Record<string, unknown>;
}

export interface TransactionValidationError extends ValidationError {
    transactionId: string;
    transactionDescription: string;
}
