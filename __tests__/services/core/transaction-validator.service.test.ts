import { TransactionValidatorService } from '../../../src/services/core/transaction-validator.service.js';
import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { deposit, transfer, withdrawal } from '../../shared/test-data.js';

describe('TransactionValidatorService', () => {
    const service = new TransactionValidatorService(
        new TransactionClassificationService('Disposable Income', 'Paycheck')
    );

    const categorized = { category_id: '7', category_name: 'Old Category' };
    const budgeted = { budget_id: '1', budget_name: 'Old Budget' };
    const uncategorized = { category_id: null, category_name: null };
    const unbudgeted = { budget_id: null, budget_name: null };

    describe('shouldProcessTransaction', () => {
        it('should return true for non-transfer transactions when force is true', () => {
            const transaction = withdrawal(100, { ...categorized, ...budgeted });

            expect(service.shouldProcessTransaction(transaction, true)).toBe(true);
        });

        it('should return false for transfer transactions when force is true', () => {
            const transaction = transfer(100, { ...categorized, ...budgeted });

            expect(service.shouldProcessTransaction(transaction, true)).toBe(false);
        });

        it('should return true for non-transfer transactions without categories when force is false', () => {
            const transaction = withdrawal(100, { ...uncategorized, ...budgeted });

            expect(service.shouldProcessTransaction(transaction, false)).toBe(true);
        });

        it('should return true for transactions with category but no budget when force is false', () => {
            const transaction = withdrawal(100, { ...categorized, ...unbudgeted });

            expect(service.shouldProcessTransaction(transaction, false)).toBe(true);
        });

        it('should return false for transactions with both category and budget when force is false', () => {
            const transaction = withdrawal(100, { ...categorized, ...budgeted });

            expect(service.shouldProcessTransaction(transaction, false)).toBe(false);
        });

        it('should return false for an uncategorized transfer when force is false', () => {
            const transaction = transfer(100, { ...uncategorized, ...unbudgeted });

            expect(service.shouldProcessTransaction(transaction, false)).toBe(false);
        });
    });

    describe('shouldSetBudget', () => {
        it('should return true when all conditions are met', () => {
            expect(service.shouldSetBudget(withdrawal(100))).toBe(true);
        });

        it('should return false when transaction is a bill', () => {
            expect(service.shouldSetBudget(withdrawal(100, { bill_id: '5' }))).toBe(false);
        });

        it('should return false when transaction is disposable income', () => {
            expect(service.shouldSetBudget(withdrawal(100, { tags: ['Disposable Income'] }))).toBe(
                false
            );
        });

        it('should return false when transaction is a deposit', () => {
            expect(service.shouldSetBudget(deposit(100))).toBe(false);
        });
    });

    describe('isBudgetOnlyCandidate', () => {
        it('should return true when transaction has category but no budget', () => {
            const transaction = withdrawal(100, { ...categorized, ...unbudgeted });

            expect(service.isBudgetOnlyCandidate(transaction)).toBe(true);
        });

        it('should return false when transaction has no category', () => {
            const transaction = withdrawal(100, { ...uncategorized, ...unbudgeted });

            expect(service.isBudgetOnlyCandidate(transaction)).toBe(false);
        });

        it('should return false when transaction has both category and budget', () => {
            const transaction = withdrawal(100, { ...categorized, ...budgeted });

            expect(service.isBudgetOnlyCandidate(transaction)).toBe(false);
        });
    });

    describe('categoryOrBudgetChanged', () => {
        const transaction = withdrawal(100, { ...categorized, ...budgeted });

        it('should return true when category has changed', () => {
            expect(
                service.categoryOrBudgetChanged(transaction, { name: 'New Category' }, { id: '1' })
            ).toBe(true);
        });

        it('should return true when budget has changed', () => {
            expect(
                service.categoryOrBudgetChanged(transaction, { name: 'Old Category' }, { id: '2' })
            ).toBe(true);
        });

        it('should return false when neither category nor budget has changed', () => {
            expect(
                service.categoryOrBudgetChanged(transaction, { name: 'Old Category' }, { id: '1' })
            ).toBe(false);
        });

        it('should return false when category and budget are undefined', () => {
            expect(service.categoryOrBudgetChanged(transaction)).toBe(false);
        });
    });
});
