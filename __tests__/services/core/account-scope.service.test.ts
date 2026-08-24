import { jest } from '@jest/globals';
import { AccountScopeService } from '../../../src/services/core/account-scope.service.js';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs.js';
import { ILogger } from '../../../src/types/interface/logger.interface.js';

type Role = 'defaultAsset' | 'savingAsset' | 'ccAsset' | 'sharedAsset' | 'cashWalletAsset';

const account = (id: string, role: Role, active = true) => ({
    type: 'accounts',
    id,
    attributes: { name: `Account ${id}`, type: 'asset', account_role: role, active },
});

const mockLogger = (): ILogger =>
    ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
    }) as unknown as ILogger;

describe('AccountScopeService', () => {
    // Mirrors the real shape: checking, savings, three cards, a brokerage, and
    // a closed account.
    const ACCOUNTS = [
        account('1', 'defaultAsset'),
        account('2', 'savingAsset'),
        account('8', 'ccAsset'),
        account('11', 'ccAsset'),
        account('14', 'ccAsset'),
        account('27', 'savingAsset'),
        account('39', 'defaultAsset'),
        account('13', 'defaultAsset', false),
    ];

    let listAccount: jest.Mock;
    let client: FireflyClientWithCerts;

    beforeEach(() => {
        listAccount = jest.fn(() =>
            Promise.resolve({
                data: ACCOUNTS,
                meta: { pagination: { total_pages: 1 } },
            })
        ) as unknown as jest.Mock;

        client = { accounts: { listAccount } } as unknown as FireflyClientWithCerts;
    });

    const build = (overrides: Partial<Parameters<typeof AccountScopeService>[1]> = {}) =>
        new AccountScopeService(
            client,
            {
                incomeDestinationAccounts: [],
                expenseSourceAccounts: [],
                untrackedAccounts: [],
                ...overrides,
            },
            mockLogger()
        );

    describe('derivation', () => {
        it('should exclude credit cards from income destinations', async () => {
            // Deposits to a card are refunds and statement credits, never income.
            const scope = build();

            expect(await scope.getIncomeDestinations()).toEqual(['1', '2', '27', '39']);
        });

        it('should treat every asset account as an expense source', async () => {
            const scope = build();

            expect(await scope.getExpenseSources()).toEqual([
                '1',
                '2',
                '8',
                '11',
                '14',
                '27',
                '39',
            ]);
        });

        it('should exclude untracked accounts from both sides', async () => {
            // The judgement Firefly cannot make: a brokerage carries the same
            // savingAsset role as an ordinary savings account, but its outflows
            // are fund transfers rather than purchases.
            const scope = build({ untrackedAccounts: ['27'] });

            expect(await scope.getIncomeDestinations()).not.toContain('27');
            expect(await scope.getExpenseSources()).not.toContain('27');
        });

        it('should exclude inactive accounts', async () => {
            // A closed account keeps its history but must not widen the scope.
            const scope = build();

            expect(await scope.getExpenseSources()).not.toContain('13');
            expect(await scope.getIncomeDestinations()).not.toContain('13');
        });

        it('should request only asset accounts', async () => {
            await build().getExpenseSources();

            expect(listAccount).toHaveBeenCalledWith(
                undefined,
                expect.any(Number),
                1,
                undefined,
                undefined,
                undefined,
                'asset'
            );
        });
    });

    describe('overrides', () => {
        it('should let an explicit income list replace derivation', async () => {
            const scope = build({ incomeDestinationAccounts: ['99'] });

            expect(await scope.getIncomeDestinations()).toEqual(['99']);
            // the other side still derives
            expect(await scope.getExpenseSources()).toContain('14');
        });

        it('should let an explicit expense list replace derivation', async () => {
            const scope = build({ expenseSourceAccounts: ['99'] });

            expect(await scope.getExpenseSources()).toEqual(['99']);
        });

        it('should skip the API call entirely when both sides are overridden', async () => {
            const scope = build({
                incomeDestinationAccounts: ['1'],
                expenseSourceAccounts: ['14'],
            });

            expect(await scope.getIncomeDestinations()).toEqual(['1']);
            expect(await scope.getExpenseSources()).toEqual(['14']);
            expect(listAccount).not.toHaveBeenCalled();
        });
    });

    describe('caching', () => {
        it('should fetch once even for concurrent callers', async () => {
            // The analyze command runs its services in parallel; they must
            // share one fetch rather than stampede.
            const scope = build();

            await Promise.all([
                scope.getIncomeDestinations(),
                scope.getExpenseSources(),
                scope.getIncomeDestinations(),
            ]);

            expect(listAccount).toHaveBeenCalledTimes(1);
        });

        it('should not cache a failure', async () => {
            listAccount.mockRejectedValueOnce(new Error('boom') as never).mockResolvedValueOnce({
                data: ACCOUNTS,
                meta: { pagination: { total_pages: 1 } },
            } as never);

            const scope = build();

            await expect(scope.getExpenseSources()).rejects.toThrow();
            await expect(scope.getExpenseSources()).resolves.toContain('1');
        });
    });

    describe('empty derivation', () => {
        it('should fail loudly rather than report zero spending', async () => {
            // Silently deriving nothing would make analyze report no expenses
            // at all, which is far worse than an error.
            listAccount.mockResolvedValue({
                data: [],
                meta: { pagination: { total_pages: 1 } },
            } as never);

            await expect(build().getExpenseSources()).rejects.toThrow(/No expense source accounts/);
        });
    });
});
