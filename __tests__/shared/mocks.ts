import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service.js';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs.js';
import { ILogger } from '../../src/types/interface/logger.interface.js';
import {
    AccountScope,
    AccountScopeService,
} from '../../src/services/core/account-scope.service.js';
import { CashFlowService, MonthBuckets } from '../../src/services/cash-flow.service.js';
import { Result } from '../../src/types/result.type.js';
import { jest } from '@jest/globals';

/**
 * A mock of `T` carrying only the members a test stubs; any other member is
 * undefined. The members are checked against `T`, so a stub for a method that
 * no longer exists, or with the wrong signature, fails the typecheck instead
 * of hiding behind a cast.
 */
export const partialMock = <T extends object>(members: Partial<T>): jest.Mocked<T> =>
    members as unknown as jest.Mocked<T>;

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
 * Creates a mocked ExcludedTransactionService
 */
export const createMockExcludedTransactionService = (): jest.Mocked<ExcludedTransactionService> =>
    partialMock<ExcludedTransactionService>({
        isExcludedTransaction: jest
            .fn<ExcludedTransactionService['isExcludedTransaction']>()
            .mockReturnValue(false),
    });

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
