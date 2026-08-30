import { AccountRead, AccountRoleProperty } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';
import { logger as defaultLogger } from '../../logger.js';
import { ILogger } from '../../types/interface/logger.interface.js';

/**
 * The two account sets the cash-flow analysis is scoped to.
 */
export interface AccountScope {
    /** Accounts a deposit must land in to count as income */
    incomeDestinations: string[];
    /** Accounts a withdrawal must come from to count as spending */
    expenseSources: string[];
}

export interface AccountScopeOverrides {
    /**
     * Explicit income destinations. When non-empty this wins outright and no
     * derivation happens.
     */
    incomeDestinationAccounts: string[];
    /** Explicit expense sources. Same override semantics. */
    expenseSourceAccounts: string[];
    /**
     * Accounts outside the tracked boundary: excluded from both derived lists,
     * so money leaving them is not spending and money arriving in them is not
     * income. A brokerage is the usual case.
     *
     * This does NOT hide money moving into one from a tracked account — a
     * withdrawal from checking to buy an investment still counts as spending,
     * because the source is tracked. Only activity whose tracked side is the
     * untracked account itself disappears.
     */
    untrackedAccounts: string[];
}

/**
 * Credit cards receive deposits — refunds, statement credits, chargebacks — but
 * those are never income. Every other asset role can legitimately receive it.
 */
const NON_INCOME_ROLES: ReadonlySet<AccountRoleProperty> = new Set<AccountRoleProperty>([
    'ccAsset',
]);

/**
 * Derives which accounts count as income destinations and expense sources from
 * Firefly's own account metadata, so the two lists cannot drift out of date as
 * accounts are added.
 *
 * Firefly knows almost enough on its own: `account_role` reliably separates
 * credit cards from everything else. The one judgement it cannot make is
 * whether an outflow from a savings-role account is spending — a tax payment
 * out of savings is, a transfer into a brokerage is not, and both look
 * identical in the metadata. `untrackedAccounts` names that exception, which is
 * why the config shrinks rather than disappears.
 */
export class AccountScopeService {
    private readonly logger: ILogger;
    /** In-flight promise, not the resolved value — see {@link resolve} */
    private inflight?: Promise<AccountScope>;

    constructor(
        private readonly client: FireflyClientWithCerts,
        private readonly overrides: AccountScopeOverrides,
        logger: ILogger = defaultLogger
    ) {
        this.logger = logger;
    }

    async getIncomeDestinations(): Promise<string[]> {
        return (await this.resolve()).incomeDestinations;
    }

    async getExpenseSources(): Promise<string[]> {
        return (await this.resolve()).expenseSources;
    }

    /**
     * Resolves the scope once per process.
     *
     * Caches the in-flight promise rather than the resolved value so that
     * concurrent callers — the analyze command runs its services in parallel —
     * share a single API call. A rejection is evicted so the next caller
     * retries rather than inheriting a cached failure.
     */
    private resolve(): Promise<AccountScope> {
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
        const { incomeDestinationAccounts, expenseSourceAccounts, untrackedAccounts } =
            this.overrides;

        // Both sides overridden means there is nothing to derive and no reason
        // to spend an API call finding out.
        if (incomeDestinationAccounts.length > 0 && expenseSourceAccounts.length > 0) {
            return {
                incomeDestinations: incomeDestinationAccounts,
                expenseSources: expenseSourceAccounts,
            };
        }

        const accounts = await this.fetchAssetAccounts();
        const untracked = new Set(untrackedAccounts);

        // The asset filter is also applied client-side, not only asked for in
        // the query. `listAccount` takes seven positional parameters with the
        // type last, and getting that wrong would quietly admit expense and
        // revenue accounts here — making every merchant a spending account and
        // every payee an income destination, with no error to show for it.
        const tracked = accounts.filter(
            account =>
                account.attributes.type === 'asset' &&
                // A closed account keeps its history but must not widen the scope
                account.attributes.active !== false &&
                !untracked.has(account.id)
        );

        const derived: AccountScope = {
            incomeDestinations: tracked
                .filter(account => !NON_INCOME_ROLES.has(account.attributes.account_role ?? null))
                .map(account => account.id),
            expenseSources: tracked.map(account => account.id),
        };

        const scope: AccountScope = {
            incomeDestinations:
                incomeDestinationAccounts.length > 0
                    ? incomeDestinationAccounts
                    : derived.incomeDestinations,
            expenseSources:
                expenseSourceAccounts.length > 0 ? expenseSourceAccounts : derived.expenseSources,
        };

        // Deriving nothing means the analysis would silently report zero
        // spending, or zero income, which is far worse than failing here. Both
        // sides are checked: an income scope that derives to nothing used to be
        // caught by AdditionalIncomeService's constructor validation, which this
        // derivation replaced.
        const empty = [
            scope.expenseSources.length === 0 ? 'expense source' : undefined,
            scope.incomeDestinations.length === 0 ? 'income destination' : undefined,
        ].filter(Boolean);

        if (empty.length > 0) {
            throw new Error(
                `No ${empty.join(' or ')} accounts could be determined. Firefly returned ` +
                    `${accounts.length} asset account(s), and untrackedAccounts excludes ` +
                    `${untracked.size}. Set the corresponding list explicitly in config.yaml, ` +
                    'or check that your asset accounts are active in Firefly III.'
            );
        }

        this.logger.debug(
            {
                assetAccounts: accounts.length,
                untracked: [...untracked],
                incomeDestinations: scope.incomeDestinations,
                expenseSources: scope.expenseSources,
                incomeOverridden: incomeDestinationAccounts.length > 0,
                expensesOverridden: expenseSourceAccounts.length > 0,
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
