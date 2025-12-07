import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { ExcludedTransactionService } from '../../../src/services/excluded-transaction.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

const DISPOSABLE_INCOME_TAG = 'Disposable Income';

describe('TransactionClassificationService', () => {
    let service: TransactionClassificationService;
    let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;

    beforeEach(() => {
        mockExcludedTransactionService = {
            isExcludedTransaction:
                jest.fn<(description: string, amount: string) => Promise<boolean>>(),
        } as any;
        service = new TransactionClassificationService(
            mockExcludedTransactionService,
            '5', // noNameExpenseAccountId
            DISPOSABLE_INCOME_TAG
        );
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
        it('should return true when transaction has bill_id', () => {
            const transaction = { bill_id: '123' } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return true when transaction has subscription_id', () => {
            const transaction = { subscription_id: '456' } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return true when transaction has both bill_id and subscription_id', () => {
            const transaction = { bill_id: '123', subscription_id: '456' } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return false when transaction has no bill_id or subscription_id', () => {
            const transaction = {} as TransactionSplit;
            expect(service.isBill(transaction)).toBe(false);
        });

        it('should return false when bill_id and subscription_id are null', () => {
            const transaction = { bill_id: null, subscription_id: null } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(false);
        });

        it('should return false when bill_id and subscription_id are undefined', () => {
            const transaction = {
                bill_id: undefined,
                subscription_id: undefined,
            } as TransactionSplit;
            expect(service.isBill(transaction)).toBe(false);
        });
    });

    describe('isDisposableIncome', () => {
        it('should return true when transaction has Disposable Income tag', () => {
            const transaction = {
                tags: [DISPOSABLE_INCOME_TAG],
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
            expect(service.hasNoDestination('5')).toBe(true);
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
            const tags = [DISPOSABLE_INCOME_TAG, 'other'];
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
