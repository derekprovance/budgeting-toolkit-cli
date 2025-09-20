import { TransactionPropertyService } from '../../../src/services/core/transaction-property.service';
import { ExcludedTransactionService } from '../../../src/services/excluded-transaction.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ExpenseAccount, Tag } from '../../../src/config';

describe('TransactionPropertyService', () => {
    let service: TransactionPropertyService;
    let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;

    beforeEach(() => {
        mockExcludedTransactionService = {
            isExcludedTransaction: jest.fn(),
        } as any;
        service = new TransactionPropertyService(mockExcludedTransactionService);
    });

    describe('isTransfer', () => {
        it('should return true for transfer transactions', () => {
            const transaction = { type: 'transfer' } as TransactionSplit;
            expect(service.isTransfer(transaction)).toBe(true);
        });

        it('should return false for non-transfer transactions', () => {
            const transaction = { type: 'deposit' } as TransactionSplit;
            expect(service.isTransfer(transaction)).toBe(false);
        });
    });

    describe('isBill', () => {
        it('should return true when transaction has Bills tag', () => {
            const transaction = {
                tags: [Tag.BILLS, 'other'],
            } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return false when transaction has no Bills tag', () => {
            const transaction = { tags: ['other'] } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(false);
        });

        it('should return false when transaction has no tags', () => {
            const transaction = {} as TransactionSplit;
            expect(service.isBill(transaction)).toBe(false);
        });

        it('should return false when tags is null', () => {
            const transaction = { tags: null } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(false);
        });
    });

    describe('isDisposableIncome', () => {
        it('should return true when transaction has Disposable Income tag', () => {
            const transaction = {
                tags: [Tag.DISPOSABLE_INCOME],
            } as TransactionSplit;
            expect(service.isDisposableIncome(transaction)).toBe(true);
        });

        it('should return false when transaction has no Disposable Income tag', () => {
            const transaction = { tags: ['other'] } as TransactionSplit;
            expect(service.isDisposableIncome(transaction)).toBe(false);
        });

        it('should return false when transaction has no tags', () => {
            const transaction = {} as TransactionSplit;
            expect(service.isDisposableIncome(transaction)).toBe(false);
        });
    });

    describe('hasNoDestination', () => {
        it('should return true when destination is NO_NAME', () => {
            expect(service.hasNoDestination(ExpenseAccount.NO_NAME)).toBe(true);
        });

        it('should return false when destination is not NO_NAME', () => {
            expect(service.hasNoDestination('other')).toBe(false);
        });

        it('should return false when destination is null', () => {
            expect(service.hasNoDestination(null)).toBe(false);
        });
    });

    describe('isSupplementedByDisposable', () => {
        it('should return true when tags include Disposable Income', () => {
            const tags = [Tag.DISPOSABLE_INCOME, 'other'];
            expect(service.isSupplementedByDisposable(tags)).toBe(true);
        });

        it('should return false when tags do not include Disposable Income', () => {
            const tags = ['other'];
            expect(service.isSupplementedByDisposable(tags)).toBe(false);
        });

        it('should return false when tags is null', () => {
            expect(service.isSupplementedByDisposable(null)).toBe(false);
        });

        it('should return false when tags is undefined', () => {
            expect(service.isSupplementedByDisposable(undefined)).toBe(false);
        });

        it('should return false when tags is empty array', () => {
            expect(service.isSupplementedByDisposable([])).toBe(false);
        });
    });

    describe('isExcludedTransaction', () => {
        it('should call excludedTransactionService.isExcludedTransaction', async () => {
            mockExcludedTransactionService.isExcludedTransaction.mockResolvedValue(true);

            const result = await service.isExcludedTransaction('test', '100.00');

            expect(mockExcludedTransactionService.isExcludedTransaction).toHaveBeenCalledWith(
                'test',
                '100.00'
            );
            expect(result).toBe(true);
        });

        it('should return false when transaction is not excluded', async () => {
            mockExcludedTransactionService.isExcludedTransaction.mockResolvedValue(false);

            const result = await service.isExcludedTransaction('test', '100.00');

            expect(result).toBe(false);
        });
    });

    describe('isDeposit', () => {
        it('should return true for deposit transactions', () => {
            const transaction = { type: 'deposit' } as TransactionSplit;
            expect(service.isDeposit(transaction)).toBe(true);
        });

        it('should return false for non-deposit transactions', () => {
            const transaction = { type: 'withdrawal' } as TransactionSplit;
            expect(service.isDeposit(transaction)).toBe(false);
        });
    });

    describe('hasACategory', () => {
        it('should return true when transaction has category_id', () => {
            const transaction = { category_id: '123' } as TransactionSplit;
            expect(service.hasACategory(transaction)).toBe(true);
        });

        it('should return false when category_id is undefined', () => {
            const transaction = { category_id: undefined } as TransactionSplit;
            expect(service.hasACategory(transaction)).toBe(false);
        });

        it('should return false when category_id is null', () => {
            const transaction = { category_id: null } as TransactionSplit;
            expect(service.hasACategory(transaction)).toBe(false);
        });
    });
});
