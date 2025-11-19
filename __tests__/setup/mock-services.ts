/**
 * Centralized service mocks for all tests
 *
 * Provides factory functions to create mocked services with common defaults.
 * This reduces duplication and makes tests more maintainable.
 */

import { TransactionService } from '../../src/services/core/transaction.service';
import { CategoryService } from '../../src/services/core/category.service';
import { BudgetService } from '../../src/services/core/budget.service';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service';
import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service';
import { UserInputService } from '../../src/services/user-input.service';
import { InteractiveTransactionUpdater } from '../../src/services/interactive-transaction-updater.service';
import { LLMAssignmentService } from '../../src/services/ai/llm-assignment.service';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs';

/**
 * Creates a mocked TransactionService with common methods
 */
export const createMockTransactionService = (): jest.Mocked<TransactionService> => {
    return {
        getTransactionsForMonth: jest.fn(),
        updateTransactionSplit: jest.fn(),
        getTransaction: jest.fn(),
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
        isExcluded: jest.fn().mockReturnValue(false),
        addExclusion: jest.fn(),
        removeExclusion: jest.fn(),
        getExclusions: jest.fn().mockReturnValue([]),
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
