import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { ServiceFactory } from '../../src/factories/service.factory.js';
import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { jest } from '@jest/globals';

// Mock all dependencies
jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/core/budget.service');
jest.mock('../../src/services/core/category.service');
jest.mock('../../src/services/additional-income.service');
jest.mock('../../src/services/unbudgeted-expense.service');
jest.mock('../../src/services/budget-report.service');
jest.mock('../../src/services/excluded-transaction.service');
jest.mock('../../src/services/core/transaction-classification.service');
jest.mock('../../src/services/paycheck-surplus.service');
jest.mock('../../src/services/core/transaction-validator.service');
jest.mock('../../src/services/ai/llm-assignment.service');
jest.mock('../../src/services/ai/llm-transaction-processing.service');
jest.mock('../../src/services/ai-transaction-update-orchestrator.service');
jest.mock('../../src/config/llm.config');
jest.mock('../../src/services/user-input.service');
jest.mock('../../src/services/interactive-transaction-updater.service');

// Mock the logger
jest.mock('../../src/logger', () => ({
    logger: {
        debug: jest.fn<(obj: unknown, msg: string) => void>(),
        info: jest.fn<(obj: unknown, msg: string) => void>(),
        warn: jest.fn<(obj: unknown, msg: string) => void>(),
        error: jest.fn<(obj: unknown, msg: string) => void>(),
        trace: jest.fn<(obj: unknown, msg: string) => void>(),
    },
}));

// Mock budget and category services to return empty arrays
import { BudgetService } from '../../src/services/core/budget.service.js';
import { CategoryService } from '../../src/services/core/category.service.js';

(BudgetService as jest.MockedClass<typeof BudgetService>).prototype.getBudgets = jest
    .fn()
    .mockResolvedValue([]);
(CategoryService as jest.MockedClass<typeof CategoryService>).prototype.getCategories = jest
    .fn()
    .mockResolvedValue([]);

describe('ServiceFactory', () => {
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        mockApiClient = {
            // Mock only the properties we need for tests
        } as unknown as jest.Mocked<FireflyClientWithCerts>;
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
            expect(services).toHaveProperty('budgetReport');
            expect(services).toHaveProperty('transactionClassificationService');
            expect(services).toHaveProperty('excludedTransactionService');
            expect(services).toHaveProperty('paycheckSurplusService');
            expect(services).toHaveProperty('transactionValidatorService');
        });
    });

    describe('createAITransactionUpdateOrchestrator', () => {
        it('should create AITransactionUpdateOrchestrator with default parameters', async () => {
            const service =
                await ServiceFactory.createAITransactionUpdateOrchestrator(mockApiClient);

            expect(service).toBeInstanceOf(AITransactionUpdateOrchestrator);
        });

        it('should create AITransactionUpdateOrchestrator with custom parameters', async () => {
            const service = await ServiceFactory.createAITransactionUpdateOrchestrator(
                mockApiClient,
                true, // includeClassified
                true // dryRun
            );

            expect(service).toBeInstanceOf(AITransactionUpdateOrchestrator);
        });
    });
});
