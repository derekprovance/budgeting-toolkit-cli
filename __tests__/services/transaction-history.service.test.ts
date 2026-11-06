import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { TransactionHistoryService } from '../../src/services/transaction-history.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { ILogger } from '../../src/types/interface/logger.interface.js';
import { deposit, transfer, withdrawal } from '../shared/test-data.js';

describe('TransactionHistoryService', () => {
    const logger = {
        trace: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    } as unknown as ILogger;
    const now = () => new Date(2026, 8, 25);

    let getTransactionsInRange: jest.Mock<ITransactionService['getTransactionsInRange']>;

    const build = (past: TransactionSplit[], months = 12, at: () => Date = now) => {
        getTransactionsInRange = jest.fn<ITransactionService['getTransactionsInRange']>(
            async () => past
        );
        return new TransactionHistoryService(
            { getTransactionsInRange } as unknown as ITransactionService,
            months,
            { logger, now: at, canCarryBudget: tx => tx.type === 'withdrawal' }
        );
    };

    const incoming = (description: string) =>
        withdrawal(5, { transaction_journal_id: '99', description });

    it('fetches the lookback window ending today', async () => {
        const history = build([], 12);

        await history.load(new Set());

        expect(getTransactionsInRange).toHaveBeenCalledWith('2025-09-25', '2026-09-25');
    });

    it('suggests from the most recent matching transaction', async () => {
        const history = build([
            withdrawal(5, {
                transaction_journal_id: '1',
                date: '2026-01-10',
                description: 'TRADER JOES #1',
                category_name: 'Old',
                budget_name: 'Old Budget',
            }),
            withdrawal(5, {
                transaction_journal_id: '2',
                date: '2026-08-10',
                description: 'Trader Joes #2',
                category_name: 'Groceries',
                budget_name: 'Food',
            }),
            withdrawal(5, {
                transaction_journal_id: '3',
                date: '2026-03-10',
                description: 'TRADER JOES #3',
                category_name: 'Middle',
            }),
        ]);

        await history.load(new Set());

        expect(history.suggest(incoming('TRADER JOES #552'))).toEqual({
            category: 'Groceries',
            budget: 'Food',
        });
    });

    it('breaks a same-day tie by the later journal id', async () => {
        const history = build([
            withdrawal(5, {
                transaction_journal_id: '20',
                description: 'Gym',
                category_name: 'Newer',
            }),
            withdrawal(5, {
                transaction_journal_id: '9',
                description: 'Gym',
                category_name: 'Older',
            }),
        ]);

        await history.load(new Set());

        // A withdrawal that could carry a budget but has none was left
        // unbudgeted on purpose, reported as null
        expect(history.suggest(incoming('GYM'))).toEqual({ category: 'Newer', budget: null });
    });

    it('lets a deposit supply the category but never decide the budget', async () => {
        const history = build([
            withdrawal(5, {
                transaction_journal_id: '1',
                date: '2026-01-10',
                description: 'AMAZON MKTP US*AB1',
                category_name: 'Groceries',
                budget_name: 'Food',
            }),
            // A newer refund: Firefly drops budgets on deposits (V8)
            deposit(5, {
                transaction_journal_id: '2',
                date: '2026-08-10',
                description: 'AMAZON MKTP US*CD2',
                category_name: 'Refunds',
                budget_name: null,
            }),
        ]);

        await history.load(new Set());

        expect(history.suggest(incoming('AMAZON MKTP US*EF3'))).toEqual({
            category: 'Refunds',
            budget: 'Food',
        });
    });

    it('takes the budget from the newest match that canCarryBudget accepts', async () => {
        getTransactionsInRange = jest.fn<ITransactionService['getTransactionsInRange']>(
            async () => [
                withdrawal(5, {
                    transaction_journal_id: '1',
                    date: '2026-01-10',
                    description: 'Rent',
                    category_name: 'Housing',
                    budget_name: 'Home',
                }),
                withdrawal(5, {
                    transaction_journal_id: '2',
                    date: '2026-08-10',
                    description: 'Rent',
                    category_name: 'Housing',
                    budget_name: null,
                    bill_id: '7',
                }),
            ]
        );
        const history = new TransactionHistoryService(
            { getTransactionsInRange } as unknown as ITransactionService,
            12,
            { logger, now, canCarryBudget: tx => !tx.bill_id }
        );

        await history.load(new Set());

        expect(history.suggest(incoming('RENT'))).toEqual({ category: 'Housing', budget: 'Home' });
    });

    it('clamps the lookback start to the last day of a shorter month', async () => {
        const history = build([], 1, () => new Date(2026, 2, 31));

        await history.load(new Set());

        // new Date(2026, 1, 31) would roll forward to March 3 and lose three days
        expect(getTransactionsInRange).toHaveBeenCalledWith('2026-02-28', '2026-03-31');
    });

    it('ignores transfers, uncategorized transactions and the tag being processed', async () => {
        const history = build([
            transfer(5, {
                transaction_journal_id: '1',
                description: 'Savings',
                category_name: 'Moves',
            }),
            withdrawal(5, {
                transaction_journal_id: '2',
                description: 'Bare',
                category_name: null,
                budget_name: null,
            }),
            withdrawal(5, {
                transaction_journal_id: '99',
                description: 'Self',
                category_name: 'Self',
            }),
        ]);

        await history.load(new Set(['99']));

        expect(history.suggest(incoming('Savings'))).toBeUndefined();
        expect(history.suggest(incoming('Bare'))).toBeUndefined();
        expect(history.suggest(incoming('Self'))).toBeUndefined();
    });

    it('suggests a category from a deposit', async () => {
        const history = build([
            deposit(5, {
                transaction_journal_id: '1',
                description: 'Refund Store',
                category_name: 'Refunds',
            }),
        ]);

        await history.load(new Set());

        expect(history.suggest(incoming('REFUND STORE'))).toEqual({ category: 'Refunds' });
    });

    it('never matches a description with no identifying words', async () => {
        const history = build([
            withdrawal(5, {
                transaction_journal_id: '1',
                description: '123 456',
                category_name: 'Groceries',
            }),
        ]);

        await history.load(new Set());

        expect(history.suggest(incoming('789'))).toBeUndefined();
    });

    it('is disabled when historyMonths is 0', async () => {
        const history = build([], 0);

        await history.load(new Set());

        expect(getTransactionsInRange).not.toHaveBeenCalled();
        expect(history.suggest(incoming('Anything'))).toBeUndefined();
    });
});
