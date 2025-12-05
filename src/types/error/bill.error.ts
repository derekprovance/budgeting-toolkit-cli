import { BaseMonthYearError, BaseErrorFactory, ErrorMessages } from './base-error.factory.js';

/**
 * Error type for bill-related operations.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BillError extends BaseMonthYearError {}

/**
 * Error types for bill operations
 */
export enum BillErrorType {
    INVALID_DATE = 'INVALID_DATE',
    FETCH_BILLS_FAILED = 'FETCH_BILLS_FAILED',
    FETCH_TRANSACTIONS_FAILED = 'FETCH_TRANSACTIONS_FAILED',
    CALCULATION_FAILED = 'CALCULATION_FAILED',
    NO_ACTIVE_BILLS = 'NO_ACTIVE_BILLS',
}

/**
 * Factory for creating bill errors with consistent structure
 */
export class BillErrorFactory extends BaseErrorFactory<BillErrorType, BillError> {
    static create(
        type: BillErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): BillError {
        const instance = new BillErrorFactory();
        const messages = instance.getMessages(type, month, year, operation, originalError);
        return this.createError(type, month, year, operation, messages, originalError);
    }

    protected getMessages(
        type: BillErrorType,
        month: number,
        year: number,
        operation: string,
        originalError?: Error
    ): ErrorMessages {
        const monthStr = this.buildMonthString(month);
        const errorDetail = this.buildErrorDetail(originalError);

        switch (type) {
            case BillErrorType.INVALID_DATE:
                return {
                    technical: `Invalid date provided for ${operation}${errorDetail}`,
                    user: `The date provided (month ${month}) is invalid. Please provide a valid month (1-12) and year.`,
                };
            case BillErrorType.FETCH_BILLS_FAILED:
                return {
                    technical: `Failed to fetch active bills for year ${year}${errorDetail}`,
                    user: `Unable to retrieve bill information for ${year}. Please check your connection and try again.`,
                };
            case BillErrorType.FETCH_TRANSACTIONS_FAILED:
                return {
                    technical: `Failed to fetch transactions for ${monthStr}${errorDetail}`,
                    user: `Unable to retrieve transaction data for ${monthStr}. Please check your connection and try again.`,
                };
            case BillErrorType.NO_ACTIVE_BILLS:
                return {
                    technical: `No active bills found for year ${year}`,
                    user: `No active bills were found for ${year}. This is not an error - you may not have any bills set up yet.`,
                };
            case BillErrorType.CALCULATION_FAILED:
                return {
                    technical: `Bill comparison calculation failed for ${operation} on ${monthStr}${errorDetail}`,
                    user: `An error occurred while calculating bill comparison for ${monthStr}. Please try again.`,
                };
            default:
                return {
                    technical: `Unknown bill error in ${operation}${errorDetail}`,
                    user: `An unexpected error occurred with bill operations. Please try again.`,
                };
        }
    }
}
