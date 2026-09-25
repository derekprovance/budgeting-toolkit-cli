import { AccountRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';
import { logger as defaultLogger } from '../../logger.js';
import { ILogger } from '../../types/interface/logger.interface.js';

/**
 * The accounts the cost-of-living envelope is drawn around. See RULES.md,
 * R-SCOPE-1 and R-INCOME-1.
 */
export interface AccountScope {
    /** Asset accounts not in `untrackedAccounts`: checking and cards */
    envelope: ReadonlySet<string>;
    /** Envelope accounts that are not credit cards: where income can land */
    income: ReadonlySet<string>;
}

/**
 * Derives the envelope from Firefly's own account metadata, so it cannot drift
 * out of date as accounts are added or closed. `untrackedAccounts` is the one
 * judgement Firefly cannot make — savings, a brokerage and the disposable pool
 * all look like ordinary asset accounts — and is the only input.
 */
export class AccountScopeService {
    private readonly logger: ILogger;
    /** In-flight promise, not the resolved value — see {@link getScope} */
    private inflight?: Promise<AccountScope>;

    constructor(
        private readonly client: FireflyClientWithCerts,
        private readonly untrackedAccounts: readonly string[],
        logger: ILogger = defaultLogger
    ) {
        this.logger = logger;
    }

    /**
     * Resolves the scope once per process.
     *
     * Caches the in-flight promise rather than the resolved value so that
     * concurrent callers share a single API call. A rejection is evicted so the
     * next caller retries rather than inheriting a cached failure.
     */
    getScope(): Promise<AccountScope> {
        if (this.inflight) {
            return this.inflight;
        }

        const promise = this.derive();
        this.inflight = promise;
        promise.catch(() => {
            this.inflight = undefined;
        });

        return promise;
    }

    private async derive(): Promise<AccountScope> {
        const accounts = await this.fetchAssetAccounts();
        const untracked = new Set(this.untrackedAccounts);

        // The asset filter is also applied client-side, not only asked for in
        // the query: getting listAccount's positional parameters wrong would
        // quietly make every merchant part of the envelope.
        // Inactive accounts stay in: closing a card must not rewrite the
        // months it was used (R-SCOPE-1)
        const envelope = accounts.filter(
            account => account.attributes.type === 'asset' && !untracked.has(account.id)
        );
        const unknown = [...untracked].filter(id => !accounts.some(a => a.id === id));
        if (unknown.length > 0) {
            this.logger.warn(
                { unknown },
                'untrackedAccounts lists ids that match no asset account - they draw no line'
            );
        }

        // A deposit onto a credit card is a refund or statement credit, never income
        const income = envelope.filter(account => account.attributes.account_role !== 'ccAsset');

        // An empty side would silently report zero spending or zero income,
        // which is far worse than failing here
        if (income.length === 0) {
            throw new Error(
                `No income account could be determined. Firefly returned ${accounts.length} ` +
                    `asset account(s), and untrackedAccounts excludes ${untracked.size}. ` +
                    'The envelope needs at least one asset account that is not a credit ' +
                    'card (checking) outside untrackedAccounts.'
            );
        }

        const scope: AccountScope = {
            envelope: new Set(envelope.map(account => account.id)),
            income: new Set(income.map(account => account.id)),
        };

        this.logger.debug(
            {
                assetAccounts: accounts.length,
                untracked: [...untracked],
                envelope: [...scope.envelope],
                income: [...scope.income],
            },
            'Resolved account scope'
        );

        return scope;
    }

    private async fetchAssetAccounts(): Promise<AccountRead[]> {
        return fetchAllPages(
            page =>
                this.client.accounts.listAccount(
                    undefined, // xTraceId
                    PAGE_SIZE,
                    page,
                    undefined, // start
                    undefined, // end
                    undefined, // date
                    'asset'
                ),
            'fetch asset accounts',
            this.logger
        );
    }
}
