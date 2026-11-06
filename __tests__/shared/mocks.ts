import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service.js';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { ILogger } from '../../src/types/interface/logger.interface.js';
import {
    AccountScope,
    AccountScopeService,
} from '../../src/services/core/account-scope.service.js';
import { CashFlowService, MonthBuckets } from '../../src/services/cash-flow.service.js';
import { Result } from '../../src/types/result.type.js';
import { CategoryBudgetCatalog } from '../../src/services/core/category-budget-catalog.service.js';
import { ICategoryService } from '../../src/services/core/category.service.interface.js';
import { IBudgetService } from '../../src/services/core/budget.service.interface.js';
import { BudgetRead } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

/**
 * A mock of `T` carrying only the members a test stubs; any other member is
 * undefined. The members are checked against `T`, so a stub for a method that
 * no longer exists, or with the wrong signature, fails the typecheck instead
 * of hiding behind a cast.
 */
export const partialMock = <T extends object>(members: Partial<T>): jest.Mocked<T> =>
    members as unknown as jest.Mocked<T>;

export const createMockLogger = (): jest.Mocked<ILogger> => {
    return {
        debug: jest.fn<(obj: unknown, msg?: string) => void>(),
        info: jest.fn<(obj: unknown, msg?: string) => void>(),
        warn: jest.fn<(obj: unknown, msg?: string) => void>(),
        error: jest.fn<(obj: unknown, msg?: string) => void>(),
        trace: jest.fn<(obj: unknown, msg?: string) => void>(),
    } as jest.Mocked<ILogger>;
};

export const createMockExcludedTransactionService = (): jest.Mocked<ExcludedTransactionService> =>
    partialMock<ExcludedTransactionService>({
        isExcludedTransaction: jest
            .fn<ExcludedTransactionService['isExcludedTransaction']>()
            .mockReturnValue(false),
    });

type Client = FireflyClientWithCerts;

/**
 * A Firefly client with a bare mock for every endpoint `src` calls; each
 * resolves to undefined until a test stubs it. The cast remains because the
 * SDK's endpoint groups are classes with many members, which `partialMock`
 * cannot check one level down.
 */
export const createMockFireflyClient = (): jest.Mocked<Client> =>
    ({
        accounts: { listAccount: jest.fn<Client['accounts']['listAccount']>() },
        bills: { listBill: jest.fn<Client['bills']['listBill']>() },
        budgets: {
            listBudget: jest.fn<Client['budgets']['listBudget']>(),
            listBudgetLimit: jest.fn<Client['budgets']['listBudgetLimit']>(),
        },
        categories: { listCategory: jest.fn<Client['categories']['listCategory']>() },
        tags: {
            getTag: jest.fn<Client['tags']['getTag']>(),
            listTransactionByTag: jest.fn<Client['tags']['listTransactionByTag']>(),
        },
        transactions: {
            listTransaction: jest.fn<Client['transactions']['listTransaction']>(),
            getTransaction: jest.fn<Client['transactions']['getTransaction']>(),
            updateTransaction: jest.fn<Client['transactions']['updateTransaction']>(),
        },
    }) as unknown as jest.Mocked<Client>;

/**
 * Account scope mock. `income` defaults to the envelope's first account, the
 * way checking is the one non-card envelope account in real data.
 */
export const createMockAccountScopeService = (
    envelope: string[] = [],
    income: string[] = envelope.slice(0, 1)
): jest.Mocked<AccountScopeService> => {
    const scope: AccountScope = { envelope: new Set(envelope), income: new Set(income) };
    return partialMock<AccountScopeService>({
        getScope: jest.fn<AccountScopeService['getScope']>().mockResolvedValue(scope),
    });
};

/** Buckets with every bucket present, overridden where given */
export const buckets = (overrides: Partial<MonthBuckets> = {}): MonthBuckets => ({
    paycheck: [],
    additionalIncome: [],
    bill: [],
    disposable: [],
    budget: [],
    unbudgeted: [],
    ...overrides,
});

/**
 * CashFlowService mock resolving to the given buckets for every month, or to
 * per-month buckets keyed `month-year`.
 */
export const createMockCashFlowService = (
    byMonth: MonthBuckets | Record<string, MonthBuckets> = buckets()
): jest.Mocked<CashFlowService> => {
    const isPerMonth = !('budget' in byMonth);
    return partialMock<CashFlowService>({
        getBuckets: jest.fn<CashFlowService['getBuckets']>((month, year) =>
            Promise.resolve(
                Result.ok(
                    isPerMonth
                        ? ((byMonth as Record<string, MonthBuckets>)[`${month}-${year}`] ??
                              buckets())
                        : (byMonth as MonthBuckets)
                )
            )
        ),
    });
};

/** A catalog loaded from the given category names and budgets. */
export const loadCatalog = (
    categoryNames: string[],
    budgets: BudgetRead[]
): Promise<CategoryBudgetCatalog> =>
    CategoryBudgetCatalog.load(
        partialMock<ICategoryService>({
            getCategories: async () => categoryNames.map(name => ({ name })),
        }),
        partialMock<IBudgetService>({ getBudgets: async () => budgets })
    );
