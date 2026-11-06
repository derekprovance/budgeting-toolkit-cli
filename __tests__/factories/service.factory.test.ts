import { jest } from '@jest/globals';
import type { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { DEFAULT_CONFIG } from '../../src/config/config.defaults.js';
import type { AppConfig } from '../../src/config/config.types.js';
import type { BudgetArray, CategoryArray } from '@derekprovance/firefly-iii-sdk';
import { createMockFireflyClient } from '../shared/mocks.js';

/*
 * Native ESM: `jest.mock` is inert (see __tests__/meta/esm-mocking.test.ts), so
 * the real services are built here from an injected config. ConfigManager is
 * replaced so the default-config fallback can be observed without the real
 * singleton looking for config files (it refuses to under BTK_STRICT_CONFIG).
 */
const testConfig: AppConfig = structuredClone(DEFAULT_CONFIG);
testConfig.api.claude.apiKey = 'test-api-key';
testConfig.transactions.tags.paycheck = 'Salary';

const mockGetInstance = jest.fn(() => ({ getConfig: () => testConfig }));
jest.unstable_mockModule('../../src/config/config-manager.js', () => ({
    ConfigManager: { getInstance: mockGetInstance },
}));

const { ServiceFactory } = await import('../../src/factories/service.factory.js');
const { AITransactionUpdateOrchestrator } =
    await import('../../src/services/ai-transaction-update-orchestrator.service.js');

describe('ServiceFactory', () => {
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        // The orchestrator loads the category and budget catalog on creation
        const emptyPage = { data: [], meta: { pagination: { total_pages: 1 } } };
        mockApiClient = createMockFireflyClient();
        mockApiClient.categories.listCategory.mockResolvedValue(emptyPage as CategoryArray);
        mockApiClient.budgets.listBudget.mockResolvedValue(emptyPage as BudgetArray);
    });

    afterEach(() => {
        mockGetInstance.mockClear();
    });

    describe('createServices', () => {
        it('should create all core services', () => {
            const services = ServiceFactory.createServices(mockApiClient, testConfig);

            expect(services).toHaveProperty('transactionService');
            expect(services).toHaveProperty('budgetService');
            expect(services).toHaveProperty('categoryService');
            expect(services).toHaveProperty('cashFlowService');
            expect(services).toHaveProperty('budgetReport');
            expect(services).toHaveProperty('transactionClassificationService');
            expect(services).toHaveProperty('excludedTransactionService');
            expect(services).toHaveProperty('transactionValidatorService');
        });

        it('should use the injected config instead of the ConfigManager singleton', () => {
            ServiceFactory.createServices(mockApiClient, testConfig);

            expect(mockGetInstance).not.toHaveBeenCalled();
        });

        it('should wire injected config values into the services', () => {
            const services = ServiceFactory.createServices(mockApiClient, testConfig);

            // The configured paycheck tag reaches the classifier
            const tagged = (tag: string) => ({ tags: [tag] }) as never;
            const classifier = services.transactionClassificationService;

            expect(classifier.isPaycheck(tagged('Salary'))).toBe(true);
            expect(classifier.isPaycheck(tagged('Paycheck'))).toBe(false);
        });

        it('should fall back to the ConfigManager singleton when no config is passed', () => {
            ServiceFactory.createServices(mockApiClient);

            expect(mockGetInstance).toHaveBeenCalled();
        });
    });

    describe('createAITransactionUpdateOrchestrator', () => {
        it('should create AITransactionUpdateOrchestrator with default parameters', async () => {
            const services = ServiceFactory.createServices(mockApiClient, testConfig);
            const service = await ServiceFactory.createAITransactionUpdateOrchestrator(
                services,
                testConfig,
                { force: false, dryRun: false }
            );

            expect(service).toBeInstanceOf(AITransactionUpdateOrchestrator);
        });
    });
});
