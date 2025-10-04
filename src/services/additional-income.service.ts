import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionService } from './core/transaction.service';
import { TransactionPropertyService } from './core/transaction-property.service';
import { logger } from '../logger';
import { DateUtils } from '../utils/date.utils';
import { getConfigValue } from '../utils/config-loader';

/**
 * Configuration for filtering additional income transactions.
 *
 * 1. validDestinationAccounts: Where the income can be deposited
 * 2. excludedDescriptions: What descriptions to exclude (e.g., payroll)
 * 3. excludeDisposableIncome: Whether to exclude disposable income
 * 4. minTransactionAmount: Minimum amount to consider as additional income
 */
interface AdditionalIncomeConfig {
    validDestinationAccounts: string[];
    excludedDescriptions: readonly string[];
    excludeDisposableIncome: boolean;
    minTransactionAmount?: number;
}

/**
 * Service for calculating additional income.
 *
 * 1. A transaction is considered additional income if:
 *    - It is a deposit (not a withdrawal or transfer)
 *    - It goes to a valid destination account
 *    - It is not payroll
 *    - It meets the minimum amount requirement (if specified)
 *    - It is not disposable income (if configured)
 *
 * 2. Description matching is normalized to handle variations:
 *    - Case insensitive
 *    - Trims whitespace
 *    - Normalizes special characters and spaces
 */
export class AdditionalIncomeService {
    private static readonly DEFAULT_CONFIG: AdditionalIncomeConfig = {
        validDestinationAccounts: [],
        excludedDescriptions: [], //TODO(DEREK) - evaluate need for excluded descriptions
        excludeDisposableIncome: true,
        minTransactionAmount: 0, //TODO(DEREK) - evaluate need for minimal transaction amount
    };

    private readonly config: AdditionalIncomeConfig;

    constructor(
        private readonly transactionService: TransactionService,
        private readonly transactionPropertyService: TransactionPropertyService,
        config: Partial<AdditionalIncomeConfig> = {}
    ) {
        const yamlConfig = this.loadConfigFromYaml();

        this.config = {
            ...AdditionalIncomeService.DEFAULT_CONFIG,
            ...yamlConfig,
            ...config,
        };
        this.validateConfig();
    }

    /**
     * Loads configuration values from the YAML file
     */
    private loadConfigFromYaml(): Partial<AdditionalIncomeConfig> {
        const validDestinationAccounts = getConfigValue<string[]>('validDestinationAccounts');
        const excludedDescriptions = getConfigValue<string[]>('excludedDescriptions');
        const excludeDisposableIncome = getConfigValue<boolean>('excludeDisposableIncome');
        const minTransactionAmount = getConfigValue<number>('minTransactionAmount');

        const yamlConfig: Partial<AdditionalIncomeConfig> = {};

        if (validDestinationAccounts) {
            yamlConfig.validDestinationAccounts = validDestinationAccounts;
        }

        if (excludedDescriptions) {
            yamlConfig.excludedDescriptions = excludedDescriptions;
        }

        if (excludeDisposableIncome !== undefined) {
            yamlConfig.excludeDisposableIncome = excludeDisposableIncome;
        }

        if (minTransactionAmount !== undefined) {
            yamlConfig.minTransactionAmount = minTransactionAmount;
        }

        return yamlConfig;
    }

    /**
     * Calculates additional income for a given month and year.
     *
     * 1. Get all transactions for the month
     * 2. Filter transactions based on criteria:
     *    - Must be deposits
     *    - Must go to valid accounts
     *    - Must not be payroll
     *    - Must meet minimum amount
     *    - Must not be disposable income (if configured)
     */
    async calculateAdditionalIncome(month: number, year: number): Promise<TransactionSplit[]> {
        try {
            DateUtils.validateMonthYear(month, year);
            const transactions = await this.transactionService.getTransactionsForMonth(month, year);

            if (!transactions?.length) {
                logger.debug(`No transactions found for month ${month}, year ${year}`);
                return [];
            }

            const additionalIncome = this.filterTransactions(transactions);

            if (!additionalIncome.length) {
                logger.debug(`No additional income found for month ${month}, year ${year}`);
            }

            return additionalIncome;
        } catch (error) {
            logger.trace(
                {
                    error,
                    month,
                    year,
                    errorMessage: error instanceof Error ? error.message : 'Unknown error',
                },
                'Error calculating additional income'
            );
            if (error instanceof Error) {
                throw new Error(
                    `Failed to calculate additional income for month ${month}: ${error.message}`
                );
            }
            throw new Error(`Failed to calculate additional income for month ${month}`);
        }
    }

    /**
     * Validates the configuration to ensure it's valid.
     *
     * 1. Must have at least one valid destination account
     * 2. Minimum transaction amount cannot be negative
     */
    private validateConfig(): void {
        if (!this.config.validDestinationAccounts.length) {
            throw new Error('At least one valid destination account must be specified');
        }

        if (!this.config.excludedDescriptions.length) {
            logger.warn(
                'No excluded descriptions specified - all deposits will be considered additional income'
            );
        }

        if (
            this.config.minTransactionAmount !== undefined &&
            this.config.minTransactionAmount < 0
        ) {
            throw new Error('Minimum transaction amount cannot be negative');
        }
    }

    /**
     * Filters transactions to find additional income.
     *
     * 1. Must be a deposit
     * 2. Must go to a valid destination account
     * 3. Must not be payroll
     * 4. Must meet minimum amount requirement
     * 5. Must not be disposable income (if configured)
     */
    private filterTransactions(transactions: TransactionSplit[]): TransactionSplit[] {
        return transactions
            .filter(t => this.transactionPropertyService.isDeposit(t))
            .filter(this.hasValidDestinationAccount)
            .filter(this.isNotPayroll)
            .filter(this.meetsMinimumAmount)
            .filter(
                t =>
                    !this.config.excludeDisposableIncome ||
                    !this.transactionPropertyService.isDisposableIncome(t)
            );
    }

    /**
     * Checks if a transaction goes to a valid destination account.
     *
     * 1. Must have a destination account
     * 2. Destination account must be in the valid accounts list
     */
    private hasValidDestinationAccount = (transaction: TransactionSplit): boolean =>
        transaction.destination_id != null &&
        this.config.validDestinationAccounts.includes(transaction.destination_id);

    /**
     * Checks if a transaction is not payroll.
     *
     * 1. Normalizes the description
     * 2. Checks if it matches any excluded descriptions
     * 3. Returns true if it doesn't match any excluded descriptions
     */
    private isNotPayroll = (transaction: TransactionSplit): boolean => {
        if (!transaction.description) {
            logger.warn({ transaction }, 'Transaction found with no description');
            return true; // Consider non-described transactions as non-payroll
        }

        const normalizedDescription = this.normalizeString(transaction.description);
        return !this.config.excludedDescriptions.some(desc =>
            normalizedDescription.includes(this.normalizeString(desc))
        );
    };

    /**
     * Checks if a transaction meets the minimum amount requirement.
     *
     * Core Logic:
     * 1. If no minimum amount is set, all positive amounts are valid
     * 2. Otherwise, amount must be greater than or equal to minimum
     * 3. Zero and negative amounts are always excluded
     */
    private meetsMinimumAmount = (transaction: TransactionSplit): boolean => {
        const amount = parseFloat(transaction.amount);
        if (isNaN(amount) || amount <= 0) {
            return false;
        }

        //TODO(DEREK) - evaluate the need for this
        if (!this.config.minTransactionAmount) {
            return true;
        }

        return amount >= this.config.minTransactionAmount;
    };

    /**
     * Normalizes a string for comparison.
     *
     * Core Logic:
     * 1. Converts to lowercase
     * 2. Trims whitespace
     * 3. Normalizes spaces and special characters
     */
    private normalizeString(input: string): string {
        return input
            .toLowerCase()
            .trim()
            .replace(/[-_\s]+/g, ' ') // Replace multiple spaces, hyphens, underscores with single space
            .replace(/[^\w\s]/g, ''); // Remove all other special characters
    }
}
