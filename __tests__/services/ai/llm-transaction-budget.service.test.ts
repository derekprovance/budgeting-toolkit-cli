import { LLMTransactionBudgetService } from '../../../src/services/ai/llm-transaction-budget.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient } from '../../../src/api/claude.client';

const mockClaudeClient = {
    chat: jest.fn(),
    chatBatch: jest.fn(),
    updateConfig: jest.fn(),
    getConfig: jest.fn(),
} as unknown as jest.Mocked<ClaudeClient>;

describe('LLMTransactionBudgetService', () => {
    let service: LLMTransactionBudgetService;

    beforeEach(() => {
        service = new LLMTransactionBudgetService(mockClaudeClient);
        jest.clearAllMocks();
    });

    const tx: TransactionSplit[] = [
        {
            description: 'WALMART',
            amount: '100',
            date: '2024-01-01',
            source_name: 'Checking',
            destination_name: 'Walmart',
            type: 'withdrawal',
            notes: '',
            transaction_journal_id: '1',
        } as TransactionSplit,
    ];
    const budgets = ['Groceries', 'Dining Out'];

    it('assigns budgets for valid transactions', async () => {
        mockClaudeClient.chat.mockResolvedValue(JSON.stringify({ budgets: ['Groceries'] }));
        const result = await service.assignBudgets(tx, budgets);
        expect(result).toEqual(['Groceries']);
    });

    it('returns empty string for invalid budget', async () => {
        mockClaudeClient.chat.mockResolvedValue(JSON.stringify({ budgets: ['InvalidBudget'] }));
        const result = await service.assignBudgets(tx, budgets);
        expect(result).toEqual(['']);
    });

    it('returns array of empty strings if no budgets provided', async () => {
        const result = await service.assignBudgets(tx, []);
        expect(result).toEqual(['']);
    });

    it('handles errors and retries, returns empty string on failure', async () => {
        mockClaudeClient.chat.mockRejectedValueOnce(new Error('Claude error'));
        mockClaudeClient.chat.mockResolvedValueOnce(JSON.stringify({ budgets: ['Groceries'] }));
        const result = await service.assignBudgets(tx, budgets);
        expect(result).toEqual(['Groceries']);
    });

    it('returns empty array for empty transactions', async () => {
        const result = await service.assignBudgets([], budgets);
        expect(result).toEqual([]);
    });
});
