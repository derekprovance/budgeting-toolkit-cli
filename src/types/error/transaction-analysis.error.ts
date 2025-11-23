import { ValidationError } from '../result.type.js';

/**
 * Error type for transaction analysis operations.
 * Provides structured error information for business logic services.
 */
export interface TransactionAnalysisError extends ValidationError {
    month: number;
    year: number;
    operation: string; // e.g., "calculateAdditionalIncome", "calculatePaycheckSurplus"
}

/**
 * Error types for specific transaction analysis failures
 */
export enum TransactionAnalysisErrorType {
    INVALID_DATE = 'INVALID_DATE',
    NO_TRANSACTIONS = 'NO_TRANSACTIONS',
    FETCH_FAILED = 'FETCH_FAILED',
    CONFIG_INVALID = 'CONFIG_INVALID',
    CALCULATION_FAILED = 'CALCULATION_FAILED',
}

/**
 * Helper to create transaction analysis errors with consistent structure
 */
export class TransactionAnalysisErrorFactory {
    static create(
        type: TransactionAnalysisErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): TransactionAnalysisError {
        const messages = this.getMessages(type, month, operation, originalError);

        return {
            field: type,
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
        };
    }

    private static getMessages(
        type: TransactionAnalysisErrorType,
        month: number,
        operation: string,
        originalError?: Error
    ): { technical: string; user: string } {
        const monthStr = `month ${month}`;
        const errorDetail = originalError ? `: ${originalError.message}` : '';

        switch (type) {
            case TransactionAnalysisErrorType.INVALID_DATE:
                return {
                    technical: `Invalid date provided for ${operation}${errorDetail}`,
                    user: `The date provided (month ${month}) is invalid. Please provide a valid month (1-12) and year.`,
                };
            case TransactionAnalysisErrorType.NO_TRANSACTIONS:
                return {
                    technical: `No transactions found for ${monthStr}`,
                    user: `No transactions were found for ${monthStr}. This may be normal if you haven't recorded any transactions yet.`,
                };
            case TransactionAnalysisErrorType.FETCH_FAILED:
                return {
                    technical: `Failed to fetch transactions for ${monthStr}${errorDetail}`,
                    user: `Unable to retrieve transactions for ${monthStr}. Please check your connection and try again.`,
                };
            case TransactionAnalysisErrorType.CONFIG_INVALID:
                return {
                    technical: `Invalid configuration for ${operation}${errorDetail}`,
                    user: `The service is not configured correctly. Please check your configuration file.`,
                };
            case TransactionAnalysisErrorType.CALCULATION_FAILED:
                return {
                    technical: `Calculation failed for ${operation} on ${monthStr}${errorDetail}`,
                    user: `An error occurred while calculating results for ${monthStr}. Please try again or contact support.`,
                };
            default:
                return {
                    technical: `Unknown error in ${operation}${errorDetail}`,
                    user: `An unexpected error occurred. Please try again.`,
                };
        }
    }
}
