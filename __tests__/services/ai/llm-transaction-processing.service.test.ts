import { LLMTransactionProcessingService } from '../../../src/services/ai/llm-transaction-processing.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { LLMAssignmentService } from '../../../src/services/ai/llm-assignment.service.js';
import { jest } from '@jest/globals';

const mockAssignmentService = {
    assignCategories: jest.fn(),
    assignBudgets: jest.fn(),
} as unknown as jest.Mocked<LLMAssignmentService>;

describe('LLMTransactionProcessingService', () => {
    let service: LLMTransactionProcessingService;

    beforeEach(() => {
        service = new LLMTransactionProcessingService(mockAssignmentService);
        jest.clearAllMocks();
    });

    const tx: TransactionSplit[] = [
        {
            description: 'STARBUCKS',
            amount: '5',
            date: '2024-01-01',
            source_name: 'Checking',
            destination_name: 'Starbucks',
            type: 'withdrawal',
            notes: '',
            transaction_journal_id: '1',
        } as TransactionSplit,
    ];
    const categories = ['Coffee & Tea', 'Dining Out'];
    const budgets = ['Groceries', 'Dining Out'];

    it('processes both categories and budgets', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['Coffee & Tea']);
        mockAssignmentService.assignBudgets.mockResolvedValue(['Groceries']);
        const result = await service.processTransactions(tx, categories, budgets);
        expect(result['1']).toEqual({
            category: 'Coffee & Tea',
            budget: 'Groceries',
        });
    });

    it('processes category-only mode', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['Coffee & Tea']);
        const result = await service.processTransactions(tx, categories, undefined);
        expect(result['1']).toEqual({ category: 'Coffee & Tea' });
    });

    it('processes budget-only mode', async () => {
        mockAssignmentService.assignBudgets.mockResolvedValue(['Groceries']);
        const result = await service.processTransactions(tx, undefined, budgets);
        expect(result['1']).toEqual({ budget: 'Groceries' });
    });

    it('returns empty object for empty transactions', async () => {
        const result = await service.processTransactions([], categories, budgets);
        expect(result).toEqual({});
    });

    // LLMAssignmentService degrades recoverable chunk failures itself, so an
    // error reaching this layer is critical and must abort the run.
    it('propagates category assignment errors instead of swallowing them', async () => {
        mockAssignmentService.assignCategories.mockRejectedValue(new Error('invalid x-api-key'));
        mockAssignmentService.assignBudgets.mockResolvedValue(['Groceries']);
        await expect(service.processTransactions(tx, categories, budgets)).rejects.toThrow(
            'invalid x-api-key'
        );
    });

    it('propagates budget assignment errors instead of swallowing them', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['Coffee & Tea']);
        mockAssignmentService.assignBudgets.mockRejectedValue(new Error('invalid x-api-key'));
        await expect(service.processTransactions(tx, categories, budgets)).rejects.toThrow(
            'invalid x-api-key'
        );
    });

    it('filters out "(no category)" placeholder values', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['(no category)']);
        mockAssignmentService.assignBudgets.mockResolvedValue(['Groceries']);
        const result = await service.processTransactions(tx, categories, budgets);
        expect(result['1']).toEqual({ budget: 'Groceries' });
        expect(result['1'].category).toBeUndefined();
    });

    it('filters out "(no budget)" placeholder values', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['Coffee & Tea']);
        mockAssignmentService.assignBudgets.mockResolvedValue(['(no budget)']);
        const result = await service.processTransactions(tx, categories, budgets);
        expect(result['1']).toEqual({ category: 'Coffee & Tea' });
        expect(result['1'].budget).toBeUndefined();
    });

    it('filters out both placeholder values when both are returned', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['(no category)']);
        mockAssignmentService.assignBudgets.mockResolvedValue(['(no budget)']);
        const result = await service.processTransactions(tx, categories, budgets);
        expect(result['1']).toEqual({});
    });
});
