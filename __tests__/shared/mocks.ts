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
export const createMockExcludedTransactionService = (): jest.Mocked<ExcludedTransactionService> => {
    return {
        isExcludedTransaction: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<ExcludedTransactionService>;
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
 * Account scope mock. `income` defaults to the envelope's first account, the
 * way checking is the one non-card envelope account in real data.
 */
export const createMockAccountScopeService = (
    envelope: string[] = [],
    income: string[] = envelope.slice(0, 1)
): jest.Mocked<AccountScopeService> => {
    const scope: AccountScope = { envelope: new Set(envelope), income: new Set(income) };
    return {
        getScope: jest.fn<() => Promise<AccountScope>>().mockResolvedValue(scope),
    } as unknown as jest.Mocked<AccountScopeService>;
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
    return {
        getBuckets: jest.fn((month: number, year: number) =>
            Promise.resolve(
                Result.ok(
                    isPerMonth
                        ? ((byMonth as Record<string, MonthBuckets>)[`${month}-${year}`] ??
                              buckets())
                        : (byMonth as MonthBuckets)
                )
            )
        ),
    } as unknown as jest.Mocked<CashFlowService>;
};
