import { BaseMonthYearError, BaseErrorFactory, ErrorMessages } from './base-error.factory.js';

/**
 * Error type for budget-related operations.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BudgetError extends BaseMonthYearError {}

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
export class BudgetErrorFactory extends BaseErrorFactory<BudgetErrorType, BudgetError> {
    static create(
        type: BudgetErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): BudgetError {
        const instance = new BudgetErrorFactory();
        const messages = instance.getMessages(type, month, year, operation, originalError);
        return this.createError(type, month, year, operation, messages, originalError);
    }

    protected getMessages(
        type: BudgetErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): ErrorMessages {
        const monthStr = this.buildMonthString(month);
        const errorDetail = this.buildErrorDetail(originalError);

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
