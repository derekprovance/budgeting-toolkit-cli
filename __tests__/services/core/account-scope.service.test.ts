import { jest } from '@jest/globals';
import { AccountScopeService } from '../../../src/services/core/account-scope.service.js';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs.js';
import { createMockFireflyClient, createMockLogger } from '../../shared/mocks.js';
import { AccountArray } from '@derekprovance/firefly-iii-sdk';

type Role = 'defaultAsset' | 'savingAsset' | 'ccAsset' | 'sharedAsset' | 'cashWalletAsset';

const account = (id: string, role: Role, active = true) => ({
    type: 'accounts',
    id,
    attributes: { name: `Account ${id}`, type: 'asset', account_role: role, active },
});

/** One page of accounts; only the fields the service reads. */
const accountPage = (data: ReturnType<typeof account>[]) =>
    ({ data, meta: { pagination: { total_pages: 1 } } }) as unknown as AccountArray;

describe('AccountScopeService', () => {
    // Mirrors the real shape: checking, savings, three cards, a brokerage, the
    // disposable pool, and a closed account.
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

    let client: jest.Mocked<FireflyClientWithCerts>;
    let listAccount: typeof client.accounts.listAccount;

    beforeEach(() => {
        client = createMockFireflyClient();
        listAccount = client.accounts.listAccount;
        listAccount.mockResolvedValue(accountPage(ACCOUNTS));
    });

    // The real config: savings, the brokerage and the pool are outside
    const UNTRACKED = ['2', '27', '39'];

    const build = (untracked: string[] = UNTRACKED) =>
        new AccountScopeService(client, untracked, createMockLogger());

    const scopeOf = async (untracked?: string[]) => {
        const scope = await build(untracked).getScope();
        return { envelope: [...scope.envelope], income: [...scope.income] };
    };

    describe('derivation', () => {
        it('[R-SCOPE-1] should put checking and the cards in the envelope', async () => {
            expect((await scopeOf()).envelope).toEqual(['1', '8', '11', '14', '13']);
        });

        it('[R-INCOME-1] should derive income accounts as the envelope minus the cards', async () => {
            // Deposits to a card are refunds and statement credits, never income
            expect((await scopeOf()).income).toEqual(['1', '13']);
        });

        it('[R-SCOPE-1] should leave untracked accounts out of both sets', async () => {
            const { envelope, income } = await scopeOf();

            for (const id of UNTRACKED) {
                expect(envelope).not.toContain(id);
                expect(income).not.toContain(id);
            }
        });

        it('[R-SCOPE-1] should keep a closed account in, so closing it rewrites no history', async () => {
            const { envelope } = await scopeOf();

            expect(envelope).toContain('13');
        });

        it('should warn about an untracked id that matches no account', async () => {
            const logger = createMockLogger();
            await new AccountScopeService(client, ['2', '999'], logger).getScope();

            expect(logger.warn).toHaveBeenCalledWith(
                { unknown: ['999'] },
                expect.stringContaining('match no asset account')
            );
        });

        it('should request only asset accounts', async () => {
            await build().getScope();

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

    describe('caching', () => {
        it('should fetch once even for concurrent callers', async () => {
            // Every command sorts several months' buckets in parallel; they
            // must share one fetch rather than stampede
            const scope = build();

            await Promise.all([scope.getScope(), scope.getScope(), scope.getScope()]);

            expect(listAccount).toHaveBeenCalledTimes(1);
        });

        it('should not cache a failure', async () => {
            listAccount
                .mockRejectedValueOnce(new Error('boom'))
                .mockResolvedValueOnce(accountPage(ACCOUNTS));

            const scope = build();

            await expect(scope.getScope()).rejects.toThrow();
            await expect(scope.getScope()).resolves.toBeDefined();
        });
    });

    describe('empty derivation', () => {
        it('should fail loudly when there are no accounts at all', async () => {
            // Silently deriving nothing would report no income or spending at
            // all, which is far worse than an error
            listAccount.mockResolvedValue(accountPage([]));

            await expect(build().getScope()).rejects.toThrow(/No income account/);
        });

        it('should fail when every envelope account is a credit card', async () => {
            // Cards can hold spending but never receive income, so the paycheck
            // and additional income would silently report $0 forever
            listAccount.mockResolvedValue(
                accountPage([account('8', 'ccAsset'), account('11', 'ccAsset')])
            );

            await expect(build().getScope()).rejects.toThrow(/No income account/);
        });
    });
});
