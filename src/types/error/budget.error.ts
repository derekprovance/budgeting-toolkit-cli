import { ValidationError } from '../result.type.js';

/**
 * Error type for budget-related operations.
 */
export interface BudgetError extends ValidationError {
    month: number;
    year: number;
    operation: string;
}

/**
 * Error types for budget operations
 */
export enum BudgetErrorType {
    INVALID_DATE = 'INVALID_DATE',
    FETCH_BUDGETS_FAILED = 'FETCH_BUDGETS_FAILED',
    FETCH_INSIGHTS_FAILED = 'FETCH_INSIGHTS_FAILED',
    FETCH_LIMITS_FAILED = 'FETCH_LIMITS_FAILED',
    FETCH_TRANSACTIONS_FAILED = 'FETCH_TRANSACTIONS_FAILED',
    CALCULATION_FAILED = 'CALCULATION_FAILED',
}

/**
 * Factory for creating budget errors with consistent structure
 */
export class BudgetErrorFactory {
    static create(
        type: BudgetErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): BudgetError {
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
        type: BudgetErrorType,
        month: number,
        operation: string,
        originalError?: Error
    ): { technical: string; user: string } {
        const monthStr = `month ${month}`;
        const errorDetail = originalError ? `: ${originalError.message}` : '';

        switch (type) {
            case BudgetErrorType.INVALID_DATE:
                return {
                    technical: `Invalid date provided for ${operation}${errorDetail}`,
                    user: `The date provided (month ${month}) is invalid. Please provide a valid month (1-12) and year.`,
                };
            case BudgetErrorType.FETCH_BUDGETS_FAILED:
                return {
                    technical: `Failed to fetch budgets for ${monthStr}${errorDetail}`,
                    user: `Unable to retrieve budget information for ${monthStr}. Please check your connection and try again.`,
                };
            case BudgetErrorType.FETCH_INSIGHTS_FAILED:
                return {
                    technical: `Failed to fetch budget insights for ${monthStr}${errorDetail}`,
                    user: `Unable to retrieve budget spending insights for ${monthStr}. Please try again.`,
                };
            case BudgetErrorType.FETCH_LIMITS_FAILED:
                return {
                    technical: `Failed to fetch budget limits for ${monthStr}${errorDetail}`,
                    user: `Unable to retrieve budget limits for ${monthStr}. Please try again.`,
                };
            case BudgetErrorType.FETCH_TRANSACTIONS_FAILED:
                return {
                    technical: `Failed to fetch transactions for ${monthStr}${errorDetail}`,
                    user: `Unable to retrieve transaction data for ${monthStr}. Please check your connection and try again.`,
                };
            case BudgetErrorType.CALCULATION_FAILED:
                return {
                    technical: `Budget calculation failed for ${operation} on ${monthStr}${errorDetail}`,
                    user: `An error occurred while calculating budget data for ${monthStr}. Please try again.`,
                };
            default:
                return {
                    technical: `Unknown budget error in ${operation}${errorDetail}`,
                    user: `An unexpected error occurred with budget operations. Please try again.`,
                };
        }
    }
}
