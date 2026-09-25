import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ITransactionService } from './core/transaction.service.interface.js';
import { DateRangeService } from './core/date-range.service.js';
import { ILogger } from '../types/interface/logger.interface.js';
import { logger as defaultLogger } from '../logger.js';
import { normalizeDescription } from '../utils/description-normalizer.js';
import { StringUtils } from '../utils/string.utils.js';

export interface HistorySuggestion {
    category?: string;
    /**
     * The budget of the latest match that could carry one. `null` when that
     * match was deliberately left unbudgeted; absent when no match could carry
     * a budget at all (a refund deposit, for example), so nothing is known.
     */
    budget?: string | null;
}

export interface TransactionHistoryOptions {
    /**
     * Whether a past transaction could have been given a budget, so its
     * missing budget means "left unbudgeted" rather than "cannot have one".
     * Defaults to withdrawals only; the factory passes the validator's rule.
     */
    canCarryBudget?: (transaction: TransactionSplit) => boolean;
    logger?: ILogger;
    now?: () => Date;
}

interface HistoryEntry {
    /** The newest match: the category source */
    latest: TransactionSplit;
    /** The newest match that could carry a budget: the budget source */
    latestBudgetable?: TransactionSplit;
}

/**
 * Suggests a category and budget for `categorize` from the most recent earlier
 * transaction with the same normalized description, so repeat merchants don't
 * need the AI.
 *
 * The lookback window is fetched once per run and indexed in memory.
 */
export class TransactionHistoryService {
    private index = new Map<string, HistoryEntry>();
    private readonly canCarryBudget: (transaction: TransactionSplit) => boolean;
    private readonly logger: ILogger;
    private readonly now: () => Date;

    constructor(
        private readonly transactionService: ITransactionService,
        private readonly historyMonths: number,
        options: TransactionHistoryOptions = {}
    ) {
        this.canCarryBudget = options.canCarryBudget ?? (tx => tx.type === 'withdrawal');
        this.logger = options.logger ?? defaultLogger;
        this.now = options.now ?? (() => new Date());
    }

    /**
     * Builds the index. `excludeJournalIds` are the transactions being
     * categorized, which must never suggest values for themselves.
     */
    async load(excludeJournalIds: ReadonlySet<string>): Promise<void> {
        this.index = new Map();
        if (this.historyMonths <= 0) {
            return;
        }

        const end = this.now();
        const start = TransactionHistoryService.monthsBefore(end, this.historyMonths);
        const transactions = await this.transactionService.getTransactionsInRange(
            DateRangeService.toLocalDateString(start),
            DateRangeService.toLocalDateString(end)
        );

        for (const tx of transactions) {
            if (tx.type !== 'withdrawal' && tx.type !== 'deposit') continue;
            if (!tx.category_name && !tx.budget_name) continue;
            if (tx.transaction_journal_id && excludeJournalIds.has(tx.transaction_journal_id)) {
                continue;
            }

            const key = normalizeDescription(tx.description);
            if (!key) continue;

            const entry = this.index.get(key) ?? { latest: tx };
            if (TransactionHistoryService.isNewer(tx, entry.latest)) {
                entry.latest = tx;
            }
            if (
                this.canCarryBudget(tx) &&
                (!entry.latestBudgetable ||
                    TransactionHistoryService.isNewer(tx, entry.latestBudgetable))
            ) {
                entry.latestBudgetable = tx;
            }
            this.index.set(key, entry);
        }

        this.logger.debug(
            {
                historyMonths: this.historyMonths,
                scanned: transactions.length,
                keys: this.index.size,
            },
            'Transaction history index built'
        );
    }

    suggest(transaction: TransactionSplit): HistorySuggestion | undefined {
        const key = normalizeDescription(transaction.description);
        const entry = key ? this.index.get(key) : undefined;
        if (!entry) {
            return undefined;
        }

        const { latest, latestBudgetable } = entry;
        return {
            ...(latest.category_name && { category: latest.category_name }),
            ...(latestBudgetable && { budget: latestBudgetable.budget_name || null }),
        };
    }

    /**
     * The canonical spelling of `name` in `options`, compared the same way the
     * AI result validator does; undefined when it is no longer listed.
     */
    static resolveName(
        name: string | null | undefined,
        options: string[] | undefined
    ): string | undefined {
        if (!name || !options) {
            return undefined;
        }
        const wanted = StringUtils.normalizeForMatching(name);
        return options.find(option => StringUtils.normalizeForMatching(option) === wanted);
    }

    /**
     * The same day of the month `months` earlier, clamped to that month's last
     * day: `new Date(y, m - n, d)` would roll Feb 31 forward into March and
     * silently shorten the window.
     */
    private static monthsBefore(date: Date, months: number): Date {
        const start = new Date(date.getFullYear(), date.getMonth() - months, 1);
        const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
        start.setDate(Math.min(date.getDate(), lastDay));
        return start;
    }

    private static isNewer(candidate: TransactionSplit, current: TransactionSplit): boolean {
        if (candidate === current) {
            return false;
        }
        const byDate = new Date(candidate.date).getTime() - new Date(current.date).getTime();
        if (byDate !== 0) {
            return byDate > 0;
        }
        return Number(candidate.transaction_journal_id) > Number(current.transaction_journal_id);
    }
}
