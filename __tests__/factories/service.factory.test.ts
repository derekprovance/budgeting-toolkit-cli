import { jest } from '@jest/globals';
import type { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { DEFAULT_CONFIG } from '../../src/config/config.defaults.js';
import type { AppConfig } from '../../src/config/config.types.js';

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
const { BudgetService } = await import('../../src/services/core/budget.service.js');
const { CategoryService } = await import('../../src/services/core/category.service.js');

// CategoryBudgetCatalog.load fetches the available budgets and
// categories; stub them on the real prototypes so no API call is made.
jest.spyOn(BudgetService.prototype, 'getBudgets').mockResolvedValue([]);
jest.spyOn(CategoryService.prototype, 'getCategories').mockResolvedValue([]);

describe('ServiceFactory', () => {
    let mockApiClient: FireflyClientWithCerts;

    beforeEach(() => {
        mockApiClient = {
            // Mock only the properties we need for tests
        } as unknown as FireflyClientWithCerts;
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
            const service = await ServiceFactory.createAITransactionUpdateOrchestrator(services);

            expect(service).toBeInstanceOf(AITransactionUpdateOrchestrator);
        });

        it('should reuse the provided services instead of rebuilding them', async () => {
            const services = ServiceFactory.createServices(mockApiClient, testConfig);
            const service = await ServiceFactory.createAITransactionUpdateOrchestrator(
                services,
                true, // force
                true, // dryRun
                testConfig
            );

            expect(service).toBeInstanceOf(AITransactionUpdateOrchestrator);
        });
    });
});
