import { ValidationError } from '../result.type.js';

/**
 * Base error interface for domain-specific errors with month/year context
 */
export interface BaseMonthYearError extends ValidationError {
    month: number;
    year: number;
    operation: string;
}

/**
 * Message pair for technical and user-facing error messages
 */
export interface ErrorMessages {
    technical: string;
    user: string;
}

/**
 * Base factory class for creating domain-specific errors with consistent structure.
 * Provides common error creation logic that subclasses can extend.
 */
export abstract class BaseErrorFactory<
    _TErrorType extends string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    TError extends BaseMonthYearError,
> {
    /**
     * Creates a structured error with technical and user-facing messages
     */
    protected static createError<TErrorType extends string, TError extends BaseMonthYearError>(
        type: TErrorType,
        month: number,
        year: number,
        operation: string,
        messages: ErrorMessages,
        originalError?: Error
    ): TError {
        return {
            field: type as string,
            message: messages.technical,
            userMessage: messages.user,
            month,
            year,
            operation,
            details: originalError
                ? {
                      originalError: originalError.message,
                      errorType: originalError.constructor.name,
                  }
                : undefined,
        } as TError;
    }

    /**
     * Helper to build error detail string
     */
    protected buildErrorDetail(originalError?: Error): string {
        return originalError ? `: ${originalError.message}` : '';
    }

    /**
     * Helper to build month string
     */
    protected buildMonthString(month: number): string {
        return `month ${month}`;
    }

    /**
     * Subclasses must implement this to provide domain-specific error messages
     */
    protected abstract getMessages(
        type: _TErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): ErrorMessages;
}
