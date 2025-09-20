import { FireflyApiClient } from '@derekprovance/firefly-iii-sdk';
import { ServiceFactory } from '../../src/factories/service.factory';
import { UpdateTransactionService } from '../../src/services/update-transaction.service';

// Mock all dependencies
jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/core/budget.service');
jest.mock('../../src/services/core/category.service');
jest.mock('../../src/services/additional-income.service');
jest.mock('../../src/services/unbudgeted-expense.service');
jest.mock('../../src/services/budget-status.service');
jest.mock('../../src/services/excluded-transaction.service');
jest.mock('../../src/services/core/transaction-property.service');
jest.mock('../../src/services/paycheck-surplus.service');
jest.mock('../../src/services/core/transaction-validator.service');
jest.mock('../../src/services/ai/llm-transaction-category.service');
jest.mock('../../src/services/ai/llm-transaction-budget.service');
jest.mock('../../src/services/ai/llm-transaction-processing.service');
jest.mock('../../src/services/update-transaction.service');
jest.mock('../../src/config/llm.config');
jest.mock('../../src/services/user-input.service');
jest.mock('../../src/services/core/transaction-updater.service');

// Mock the logger
jest.mock('../../src/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    },
}));

// Mock budget and category services to return empty arrays
import { BudgetService } from '../../src/services/core/budget.service';
import { CategoryService } from '../../src/services/core/category.service';

(BudgetService as jest.MockedClass<typeof BudgetService>).prototype.getBudgets = jest
    .fn()
    .mockResolvedValue([]);
(CategoryService as jest.MockedClass<typeof CategoryService>).prototype.getCategories = jest
    .fn()
    .mockResolvedValue([]);

describe('ServiceFactory', () => {
    let mockApiClient: jest.Mocked<FireflyApiClient>;

    beforeEach(() => {
        mockApiClient = {
            // Mock only the properties we need for tests
        } as unknown as jest.Mocked<FireflyApiClient>;
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createServices', () => {
        it('should create all core services', () => {
            const services = ServiceFactory.createServices(mockApiClient);

            expect(services).toHaveProperty('transactionService');
            expect(services).toHaveProperty('budgetService');
            expect(services).toHaveProperty('categoryService');
            expect(services).toHaveProperty('additionalIncomeService');
            expect(services).toHaveProperty('unbudgetedExpenseService');
            expect(services).toHaveProperty('budgetStatus');
            expect(services).toHaveProperty('transactionPropertyService');
            expect(services).toHaveProperty('excludedTransactionService');
            expect(services).toHaveProperty('paycheckSurplusService');
            expect(services).toHaveProperty('transactionValidatorService');
        });
    });

    describe('createUpdateTransactionService', () => {
        it('should create UpdateTransactionService with default parameters', async () => {
            const service = await ServiceFactory.createUpdateTransactionService(mockApiClient);

            expect(service).toBeInstanceOf(UpdateTransactionService);
        });

        it('should create UpdateTransactionService with custom parameters', async () => {
            const service = await ServiceFactory.createUpdateTransactionService(
                mockApiClient,
                true, // includeClassified
                true // dryRun
            );

            expect(service).toBeInstanceOf(UpdateTransactionService);
        });
    });
});
