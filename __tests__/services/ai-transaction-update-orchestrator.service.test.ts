import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BudgetRead, TransactionRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { AITransactionUpdateOrchestrator } from '../../src/services/ai-transaction-update-orchestrator.service.js';
import { TransactionService } from '../../src/services/core/transaction.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { ICategoryService } from '../../src/services/core/category.service.interface.js';
import { IBudgetService } from '../../src/services/core/budget.service.interface.js';
import { CategoryBudgetCatalog } from '../../src/services/core/category-budget-catalog.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { TransactionValidatorService } from '../../src/services/core/transaction-validator.service.js';
import { TransactionHistoryService } from '../../src/services/transaction-history.service.js';
import { LLMAssignmentService } from '../../src/services/ai/llm-assignment.service.js';
import { InteractiveTransactionUpdater } from '../../src/services/interactive-transaction-updater.service.js';
import { ReviewCancelledError } from '../../src/services/user-input.service.js';
import { TransactionValidationError } from '../../src/types/result.type.js';
import { CategorizeMode, CategorizeStatus } from '../../src/types/enums.js';
import { deposit, transfer, withdrawal } from '../shared/test-data.js';
import { partialMock } from '../shared/mocks.js';

const budget = (id: string, name: string): BudgetRead =>
    ({ id, type: 'budgets', attributes: { name } }) as BudgetRead;

const CATEGORIES = ['Groceries', 'Dining'];
const BUDGETS = [budget('1', 'Food'), budget('2', 'Fun')];

/** An uncategorized, unbudgeted withdrawal */
const incoming = (id: string, description = `Transaction ${id}`, fields = {}) =>
    withdrawal(10, {
        transaction_journal_id: id,
        description,
        category_id: null,
        category_name: null,
        budget_id: null,
        budget_name: null,
        ...fields,
    });

const validationError = (id: string): TransactionValidationError => ({
    field: 'category',
    message: 'Invalid category',
    userMessage: `Invalid category for ${id}`,
    transactionId: id,
    transactionDescription: `Transaction ${id}`,
});

/** The AI's answer for one transaction; a field left out is "no match" */
interface AIAnswer {
    category?: string;
    budget?: string;
}

interface BuildOptions {
    past?: TransactionSplit[];
    force?: boolean;
    historyFails?: boolean;
}

describe('AITransactionUpdateOrchestrator', () => {
    let tagged: TransactionSplit[];
    let aiAnswers: Record<string, AIAnswer>;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockUpdater: jest.Mocked<InteractiveTransactionUpdater>;
    let assign: jest.Mock<LLMAssignmentService['assign']>;

    const build = async ({ past = [], force = false, historyFails = false }: BuildOptions = {}) => {
        const catalog = await CategoryBudgetCatalog.load(
            partialMock<ICategoryService>({
                getCategories: async () => CATEGORIES.map(name => ({ name })),
            }),
            partialMock<IBudgetService>({ getBudgets: async () => BUDGETS })
        );
        const validator = new TransactionValidatorService(
            new TransactionClassificationService('Disposable Income', 'Paycheck')
        );
        const historySource = partialMock<ITransactionService>({
            getTransactionsInRange: async () => {
                if (historyFails) throw new Error('Firefly timed out on page 7');
                return past;
            },
        });
        return new AITransactionUpdateOrchestrator(
            mockTransactionService,
            mockUpdater,
            catalog,
            partialMock<LLMAssignmentService>({ assign }),
            validator,
            new TransactionHistoryService(historySource, 12, {
                canCarryBudget: t => validator.shouldSetBudget(t),
            }),
            { force, dryRun: false }
        );
    };

    const run = async (mode = CategorizeMode.Both, options?: BuildOptions) =>
        (await build(options)).updateTransactionsByTag('tag', mode);

    /** The AI's answers, by journal id; a field left out is "no match" */
    const givenAI = (answers: Record<string, AIAnswer>) => {
        aiAnswers = answers;
    };

    /** Journal ids sent to the AI for `field` */
    const askedAI = (field: 'category' | 'budget') =>
        assign.mock.calls
            .filter(([type]) => type === field)
            .flatMap(([, transactions]) => transactions.map(t => t.transaction_journal_id));

    /** The options the AI was offered for `field` */
    const offeredAI = (field: 'category' | 'budget') =>
        assign.mock.calls.find(([type]) => type === field)?.[2];

    /** The suggestion handed to the updater for `journalId` */
    const suggestionFor = (journalId: string) => {
        const call = mockUpdater.prepareUpdate.mock.calls.find(
            ([suggestion]) => suggestion.transaction.transaction_journal_id === journalId
        );
        return (
            call && { category: call[0].category, budget: call[0].budget, source: call[0].source }
        );
    };

    const appliedJournalIds = () =>
        mockUpdater.applyUpdate.mock.calls.map(
            ([update]) => update.transaction.transaction_journal_id
        );

    beforeEach(() => {
        tagged = [];
        aiAnswers = {};
        mockTransactionService = partialMock<TransactionService>({
            tagExists: jest.fn<TransactionService['tagExists']>().mockResolvedValue(true),
            getTransactionsByTag: jest
                .fn<TransactionService['getTransactionsByTag']>()
                .mockImplementation(async () => tagged),
        });

        assign = jest.fn<LLMAssignmentService['assign']>(async (type, transactions) =>
            transactions.map(t => aiAnswers[t.transaction_journal_id ?? '']?.[type])
        );

        // By default every suggestion that names something validates and the
        // user accepts it
        mockUpdater = partialMock<InteractiveTransactionUpdater>({
            prepareUpdate: jest.fn<InteractiveTransactionUpdater['prepareUpdate']>(
                ({ transaction, category, budget, source }) => ({
                    ok: true,
                    value: category || budget ? { transaction, source } : undefined,
                })
            ),
            applyUpdate: jest.fn<InteractiveTransactionUpdater['applyUpdate']>(async () => ({
                ok: true,
                value: {} as TransactionRead,
            })),
        });
    });

    describe('what is processed', () => {
        it('reports a tag that does not exist', async () => {
            mockTransactionService.tagExists.mockResolvedValue(false);

            expect((await run()).status).toBe(CategorizeStatus.NO_TAG);
        });

        it('reports a tag with nothing to process', async () => {
            expect((await run()).status).toBe(CategorizeStatus.EMPTY_TAG);
        });

        it('never processes a transfer', async () => {
            tagged = [transfer(10, { transaction_journal_id: '1' })];

            expect((await run()).status).toBe(CategorizeStatus.EMPTY_TAG);
        });

        it('skips a categorized and budgeted transaction unless forced', async () => {
            tagged = [incoming('1', 'Done', { category_id: '5', budget_id: '1' })];

            expect((await run()).status).toBe(CategorizeStatus.EMPTY_TAG);
            expect((await run(CategorizeMode.Both, { force: true })).status).toBe(
                CategorizeStatus.HAS_RESULTS
            );
        });

        it('skips a transaction without a journal id', async () => {
            tagged = [incoming('1', 'No id', { transaction_journal_id: undefined })];

            expect((await run()).status).toBe(CategorizeStatus.EMPTY_TAG);
        });
    });

    describe('AI suggestions', () => {
        it('asks for a category and a budget and applies each accepted suggestion', async () => {
            tagged = [incoming('1'), incoming('2')];
            givenAI({ '1': { category: 'Dining', budget: 'Fun' }, '2': { category: 'Groceries' } });

            const result = await run();

            expect(askedAI('category')).toEqual(['1', '2']);
            expect(askedAI('budget')).toEqual(['1', '2']);
            expect(offeredAI('category')).toEqual(['Dining', 'Groceries']);
            expect(offeredAI('budget')).toEqual(['Food', 'Fun']);
            expect(suggestionFor('1')).toEqual({
                category: 'Dining',
                budget: 'Fun',
                source: { category: 'ai', budget: 'ai' },
            });
            expect(suggestionFor('2')).toEqual({
                category: 'Groceries',
                source: { category: 'ai' },
            });
            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(result.transactionsUpdated).toBe(2);
        });

        it('prompts for nothing when the AI finds no match', async () => {
            tagged = [incoming('1')];

            const result = await run();

            expect(mockUpdater.applyUpdate).not.toHaveBeenCalled();
            expect(result.transactionsUpdated).toBe(0);
        });

        it('asks only for categories in category mode', async () => {
            tagged = [incoming('1')];
            givenAI({ '1': { category: 'Dining', budget: 'Fun' } });

            await run(CategorizeMode.Category);

            expect(askedAI('budget')).toEqual([]);
            expect(suggestionFor('1')).toEqual({
                category: 'Dining',
                source: { category: 'ai' },
            });
        });

        it('leaves a categorized transaction alone in category mode', async () => {
            tagged = [incoming('1', 'Has category', { category_id: '5' })];

            const result = await run(CategorizeMode.Category);

            expect(assign).not.toHaveBeenCalled();
            expect(mockUpdater.applyUpdate).not.toHaveBeenCalled();
            expect(result.transactionsUpdated).toBe(0);
        });

        it('asks only for budgets in budget mode', async () => {
            tagged = [incoming('1', 'Has category', { category_id: '5' }), incoming('2')];

            await run(CategorizeMode.Budget);

            expect(askedAI('category')).toEqual([]);
            expect(askedAI('budget')).toEqual(['1', '2']);
        });

        it('asks only for the budget of a transaction that has a category', async () => {
            tagged = [incoming('1', 'Has category', { category_id: '5' }), incoming('2')];

            await run();

            expect(askedAI('category')).toEqual(['2']);
            expect(askedAI('budget')).toEqual(['1', '2']);
        });

        it('lets --force replace an existing category', async () => {
            tagged = [incoming('1', 'Has category', { category_id: '5' })];

            await run(CategorizeMode.Both, { force: true });

            expect(askedAI('category')).toEqual(['1']);
        });

        it('never asks for a budget on a deposit', async () => {
            tagged = [deposit(10, { transaction_journal_id: '1', category_id: null })];

            await run();

            expect(askedAI('category')).toEqual(['1']);
            expect(askedAI('budget')).toEqual([]);
        });

        it('never asks for a budget the validator would refuse (bill-linked)', async () => {
            tagged = [incoming('1', 'RENT', { bill_id: '7' })];

            await run();

            expect(askedAI('category')).toEqual(['1']);
            expect(askedAI('budget')).toEqual([]);
        });

        it('fails the run when the AI layer hits a critical error', async () => {
            tagged = [incoming('1')];
            const error = new Error('invalid x-api-key');
            assign.mockRejectedValue(error);

            await expect(run()).rejects.toBe(error);
            expect(mockUpdater.applyUpdate).not.toHaveBeenCalled();
        });

        it('fails the run when the transactions cannot be fetched', async () => {
            const error = new Error('Firefly is down');
            mockTransactionService.getTransactionsByTag.mockRejectedValue(error);

            await expect(run()).rejects.toBe(error);
        });
    });

    describe('review', () => {
        beforeEach(() => {
            tagged = [incoming('1'), incoming('2'), incoming('3')];
            givenAI({
                '1': { category: 'Dining' },
                '2': { category: 'Dining' },
                '3': { category: 'Dining' },
            });
        });

        it('numbers only the prompts that survive validation', async () => {
            mockUpdater.prepareUpdate
                .mockReturnValueOnce({ ok: true, value: undefined })
                .mockReturnValueOnce({ ok: false, error: validationError('2') });

            const result = await run();

            // Validation runs for all three before the first prompt, so the
            // one prompt shown is numbered 1 of 1, not 3 of 3
            expect(appliedJournalIds()).toEqual(['3']);
            expect(mockUpdater.applyUpdate.mock.calls[0][1]).toEqual({ index: 1, total: 1 });
            expect(result.errors).toEqual([validationError('2')]);
        });

        it('returns the transactions that failed', async () => {
            mockUpdater.applyUpdate
                .mockResolvedValueOnce({ ok: false, error: validationError('1') })
                .mockResolvedValueOnce({ ok: false, error: validationError('2') });

            const result = await run();

            expect(result.transactionsUpdated).toBe(1);
            expect(result.errors).toEqual([validationError('1'), validationError('2')]);
        });

        it('stops reviewing when the user presses Ctrl-C', async () => {
            mockUpdater.applyUpdate
                .mockResolvedValueOnce({ ok: true, value: {} as TransactionRead })
                .mockRejectedValueOnce(new ReviewCancelledError());

            const result = await run();

            expect(appliedJournalIds()).toEqual(['1', '2']);
            expect(result.transactionsUpdated).toBe(1);
            // Cancelling is the user's choice, not a failed transaction
            expect(result.errors).toEqual([]);
        });
    });

    describe('history suggestions', () => {
        const past = (description: string, fields: Partial<TransactionSplit>) =>
            withdrawal(12, { transaction_journal_id: '900', description, ...fields });

        it('uses a full history match without calling the AI', async () => {
            tagged = [incoming('10', 'TRADER JOES #552')];

            await run(CategorizeMode.Both, {
                past: [
                    past('Trader Joes #118', { category_name: 'Groceries', budget_name: 'Food' }),
                ],
            });

            expect(assign).not.toHaveBeenCalled();
            expect(suggestionFor('10')).toEqual({
                category: 'Groceries',
                budget: 'Food',
                source: { category: 'history', budget: 'history' },
            });
        });

        it('keeps a merchant unbudgeted when its last match had no budget', async () => {
            tagged = [incoming('10', 'COFFEE BAR')];

            await run(CategorizeMode.Both, {
                past: [past('Coffee Bar', { category_name: 'Dining', budget_name: null })],
            });

            expect(assign).not.toHaveBeenCalled();
            expect(suggestionFor('10')).toEqual({
                category: 'Dining',
                source: { category: 'history' },
            });
        });

        it('falls back to the AI when the remembered budget no longer exists', async () => {
            tagged = [incoming('10', 'GYM')];
            givenAI({ '10': { budget: 'Fun' } });

            await run(CategorizeMode.Both, {
                past: [past('Gym', { category_name: 'groceries', budget_name: 'Deleted Budget' })],
            });

            expect(askedAI('category')).toEqual([]);
            expect(askedAI('budget')).toEqual(['10']);
            // The history name is matched case-insensitively and canonicalized
            expect(suggestionFor('10')).toEqual({
                category: 'Groceries',
                budget: 'Fun',
                source: { category: 'history', budget: 'ai' },
            });
        });

        it('fills only the budget of a transaction that has a category', async () => {
            tagged = [incoming('10', 'TRADER JOES', { category_id: '5', category_name: 'Dining' })];

            await run(CategorizeMode.Both, {
                past: [past('Trader Joes', { category_name: 'Groceries', budget_name: 'Food' })],
            });

            expect(assign).not.toHaveBeenCalled();
            expect(suggestionFor('10')).toEqual({
                budget: 'Food',
                source: { budget: 'history' },
            });
        });

        it('ignores history budgets in category mode', async () => {
            tagged = [incoming('10', 'TRADER JOES')];

            await run(CategorizeMode.Category, {
                past: [past('Trader Joes', { category_name: 'Groceries', budget_name: 'Food' })],
            });

            expect(suggestionFor('10')).toEqual({
                category: 'Groceries',
                source: { category: 'history' },
            });
        });

        it('asks the AI for a budget when the only match is a refund deposit', async () => {
            tagged = [incoming('10', 'AMAZON MKTP US*EF3')];
            givenAI({ '10': { budget: 'Fun' } });

            await run(CategorizeMode.Both, {
                past: [
                    // A deposit can never carry a budget (V8), so its missing
                    // budget says nothing about what this withdrawal should get
                    deposit(12, {
                        transaction_journal_id: '900',
                        description: 'AMAZON MKTP US*CD2',
                        category_name: 'Groceries',
                        budget_name: null,
                    }),
                ],
            });

            expect(askedAI('budget')).toEqual(['10']);
            expect(suggestionFor('10')).toEqual({
                category: 'Groceries',
                budget: 'Fun',
                source: { category: 'history', budget: 'ai' },
            });
        });

        it('falls back to the AI when history cannot be loaded', async () => {
            tagged = [incoming('10', 'TRADER JOES')];
            givenAI({ '10': { category: 'Dining', budget: 'Fun' } });

            const result = await run(CategorizeMode.Both, { historyFails: true });

            expect(result.status).toBe(CategorizeStatus.HAS_RESULTS);
            expect(suggestionFor('10')).toEqual({
                category: 'Dining',
                budget: 'Fun',
                source: { category: 'ai', budget: 'ai' },
            });
        });
    });
});
