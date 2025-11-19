import { LLMTransactionProcessingService } from '../../../src/services/ai/llm-transaction-processing.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { LLMAssignmentService } from '../../../src/services/ai/llm-assignment.service';

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

    it('handles category service errors gracefully', async () => {
        mockAssignmentService.assignCategories.mockRejectedValue(
            new Error('Category service error')
        );
        mockAssignmentService.assignBudgets.mockResolvedValue(['Groceries']);
        const result = await service.processTransactions(tx, categories, budgets);
        expect(result['1']).toEqual({ budget: 'Groceries' });
    });

    it('handles budget service errors gracefully', async () => {
        mockAssignmentService.assignCategories.mockResolvedValue(['Coffee & Tea']);
        mockAssignmentService.assignBudgets.mockRejectedValue(new Error('Budget service error'));
        const result = await service.processTransactions(tx, categories, budgets);
        expect(result['1']).toEqual({ category: 'Coffee & Tea' });
    });
});
