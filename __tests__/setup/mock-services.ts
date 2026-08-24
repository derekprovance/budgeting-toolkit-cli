/**
 * Centralized service mocks for all tests
 *
 * Provides factory functions to create mocked services with common defaults.
 * This reduces duplication and makes tests more maintainable.
 */

import { TransactionService } from '../../src/services/core/transaction.service.js';
import { CategoryService } from '../../src/services/core/category.service.js';
import { BudgetService } from '../../src/services/core/budget.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service.js';
import { UserInputService } from '../../src/services/user-input.service.js';
import { InteractiveTransactionUpdater } from '../../src/services/interactive-transaction-updater.service.js';
import { LLMAssignmentService } from '../../src/services/ai/llm-assignment.service.js';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { ILogger } from '../../src/types/interface/logger.interface.js';
import { TransactionSplitService } from '../../src/services/transaction-split.service.js';
import { AccountScopeService } from '../../src/services/core/account-scope.service.js';
import { SplitTransactionDisplayService } from '../../src/services/display/split-transaction-display.service.js';
import { jest } from '@jest/globals';

/**
 * Creates a mocked Logger with common logging methods
 */
export const createMockLogger = (): jest.Mocked<ILogger> => {
    return {
        debug: jest.fn<(obj: unknown, msg?: string) => void>(),
        info: jest.fn<(obj: unknown, msg?: string) => void>(),
        warn: jest.fn<(obj: unknown, msg?: string) => void>(),
        error: jest.fn<(obj: unknown, msg?: string) => void>(),
        trace: jest.fn<(obj: unknown, msg?: string) => void>(),
    } as jest.Mocked<ILogger>;
};

/**
 * Creates a mocked TransactionService with common methods
 */
export const createMockTransactionService = (): jest.Mocked<TransactionService> => {
    return {
        getTransactionsForMonth: jest.fn(),
        updateTransaction: jest.fn(),
        getTransactionReadBySplit: jest.fn(),
        getTransactionsByTag: jest.fn(),
        tagExists: jest.fn(),
        getMostRecentTransactionDate: jest.fn(),
        clearCache: jest.fn(),
    } as unknown as jest.Mocked<TransactionService>;
};

/**
 * Creates a mocked CategoryService with common methods
 */
export const createMockCategoryService = (): jest.Mocked<CategoryService> => {
    return {
        getCategories: jest.fn(),
        getCategoryByName: jest.fn(),
        getCategoryById: jest.fn(),
    } as unknown as jest.Mocked<CategoryService>;
};

/**
 * Creates a mocked BudgetService with common methods
 */
export const createMockBudgetService = (): jest.Mocked<BudgetService> => {
    return {
        getBudgets: jest.fn(),
        getBudgetByName: jest.fn(),
        getBudgetById: jest.fn(),
        getBudgetLimitsForMonth: jest.fn(),
    } as unknown as jest.Mocked<BudgetService>;
};

/**
 * Creates a mocked TransactionClassificationService
 */
export const createMockTransactionClassificationService =
    (): jest.Mocked<TransactionClassificationService> => {
        return {
            isDeposit: jest.fn(),
            isTransfer: jest.fn(),
            isBill: jest.fn(),
            isPaycheck: jest.fn(),
            isDisposableIncome: jest.fn(),
        } as unknown as jest.Mocked<TransactionClassificationService>;
    };

/**
 * Creates a mocked TransactionValidatorService
 */
export const createMockTransactionValidatorService =
    (): jest.Mocked<TransactionValidatorService> => {
        return {
            validateTransaction: jest.fn(),
            validateTransactionSplit: jest.fn(),
            isValidAmount: jest.fn(),
            isValidAccount: jest.fn(),
        } as unknown as jest.Mocked<TransactionValidatorService>;
    };

/**
 * Creates a mocked ExcludedTransactionService
 */
export const createMockExcludedTransactionService = (): jest.Mocked<ExcludedTransactionService> => {
    return {
        getExcludedTransactions: jest.fn().mockResolvedValue([]),
        isExcludedTransaction: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<ExcludedTransactionService>;
};

/**
 * Creates a mocked UserInputService
 */
export const createMockUserInputService = (): jest.Mocked<UserInputService> => {
    return {
        promptForAction: jest.fn(),
        promptForCategory: jest.fn(),
        promptForBudget: jest.fn(),
        promptForEditChoices: jest.fn(),
        confirm: jest.fn(),
        getSplitAmount: jest.fn(),
        getCustomSplitText: jest.fn(),
        confirmSplit: jest.fn(),
        validateSplitAmount: jest.fn(),
    } as unknown as jest.Mocked<UserInputService>;
};

/**
 * Creates a mocked InteractiveTransactionUpdater
 */
export const createMockInteractiveTransactionUpdater =
    (): jest.Mocked<InteractiveTransactionUpdater> => {
        return {
            updateTransaction: jest.fn(),
            updateTransactions: jest.fn(),
        } as unknown as jest.Mocked<InteractiveTransactionUpdater>;
    };

/**
 * Creates a mocked LLMAssignmentService
 */
export const createMockLLMAssignmentService = (): jest.Mocked<LLMAssignmentService> => {
    return {
        assignCategories: jest.fn(),
        assignBudgets: jest.fn(),
    } as unknown as jest.Mocked<LLMAssignmentService>;
};

/**
 * Creates a mocked TransactionSplitService
 */
export const createMockTransactionSplitService = (): jest.Mocked<TransactionSplitService> => {
    return {
        getTransaction: jest.fn(),
        splitTransaction: jest.fn(),
        validateSplitAmounts: jest.fn(),
    } as unknown as jest.Mocked<TransactionSplitService>;
};

/**
 * Creates a mocked SplitTransactionDisplayService
 */
export const createMockSplitTransactionDisplayService =
    (): jest.Mocked<SplitTransactionDisplayService> => {
        return {
            formatHeader: jest.fn(),
            formatOriginalTransaction: jest.fn(),
            formatRemainder: jest.fn(),
            formatSplitPreview: jest.fn(),
            formatSuccess: jest.fn(),
            formatError: jest.fn(),
        } as unknown as jest.Mocked<SplitTransactionDisplayService>;
    };

/**
 * Creates a mocked FireflyClientWithCerts (API client)
 */
export const createMockFireflyClient = (): jest.Mocked<FireflyClientWithCerts> => {
    return {
        transactions: {
            listTransaction: jest.fn(),
            getTransaction: jest.fn(),
            updateTransaction: jest.fn(),
        },
        categories: {
            listCategory: jest.fn(),
            getCategory: jest.fn(),
        },
        budgets: {
            listBudget: jest.fn(),
            getBudget: jest.fn(),
        },
        tags: {
            getTag: jest.fn(),
            listTransactionByTag: jest.fn(),
        },
    } as unknown as jest.Mocked<FireflyClientWithCerts>;
};

/**
 * Reset all mocks in a service (useful in beforeEach)
 */
export const resetServiceMocks = <T extends Record<string, unknown>>(service: T): void => {
    Object.values(service).forEach(value => {
        if (jest.isMockFunction(value)) {
            value.mockClear();
        }
    });
};

/**
 * Reset multiple services at once
 */
export const resetAllServiceMocks = (...services: Array<Record<string, unknown>>): void => {
    services.forEach(resetServiceMocks);
};

/**
 * Account scope mock. Defaults mirror a typical derived scope so existing tests
 * keep the account IDs they already use; pass explicit lists to vary it.
 */
export const createMockAccountScopeService = (
    incomeDestinations: string[] = [],
    expenseSources: string[] = []
): jest.Mocked<AccountScopeService> => {
    return {
        getIncomeDestinations: jest
            .fn<() => Promise<string[]>>()
            .mockResolvedValue(incomeDestinations),
        getExpenseSources: jest.fn<() => Promise<string[]>>().mockResolvedValue(expenseSources),
    } as unknown as jest.Mocked<AccountScopeService>;
};
