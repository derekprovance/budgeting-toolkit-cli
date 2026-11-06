import { CurrencyUtils } from './currency.utils.js';

const SPLIT_AMOUNT_FORMAT = /^\d+(\.\d{1,2})?$/;
const MIN_SPLIT_AMOUNT = 0.01;

export function remainderAmount(originalAmount: number, firstSplitAmount: number): number {
    return parseFloat((originalAmount - firstSplitAmount).toFixed(2));
}

/**
 * The first split must leave at least a cent for the second. Returns true or
 * the message to show (inquirer's `validate` contract).
 */
export function validateSplitAmount(
    value: string,
    originalAmount: number,
    currencySymbol: string
): true | string {
    const trimmed = value.trim();
    if (trimmed === '') {
        return 'Amount is required';
    }
    if (!SPLIT_AMOUNT_FORMAT.test(trimmed)) {
        return 'Please enter a valid amount with at most 2 decimal places (e.g., 10.50)';
    }

    // The format admits only 0 or at least a cent
    const amount = parseFloat(trimmed);
    if (amount === 0) {
        return 'Amount must be greater than zero';
    }
    if (amount >= originalAmount) {
        return `Amount must be less than the original amount (${currencySymbol}${originalAmount})`;
    }

    const secondSplitAmount = remainderAmount(originalAmount, amount);
    if (secondSplitAmount < MIN_SPLIT_AMOUNT) {
        return `Second split would be too small (${CurrencyUtils.formatWithSymbol(secondSplitAmount, currencySymbol)}). Please enter a smaller amount.`;
    }

    return true;
}

/** @throws Error carrying validateSplitAmount's message when it is invalid */
export function parseSplitAmount(
    value: string,
    originalAmount: number,
    currencySymbol: string
): number {
    const validation = validateSplitAmount(value, originalAmount, currencySymbol);
    if (validation !== true) {
        throw new Error(validation);
    }
    return parseFloat(value.trim());
}
