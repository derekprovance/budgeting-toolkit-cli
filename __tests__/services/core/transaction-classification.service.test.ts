import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service.js';
import { Bucket } from '../../../src/services/core/transaction-classification.service.interface.js';
import { AccountScope } from '../../../src/services/core/account-scope.service.js';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { deposit, transfer, withdrawal } from '../../shared/test-data.js';

const DISPOSABLE_INCOME_TAG = 'Disposable Income';
const PAYCHECK_TAG = 'Paycheck';

describe('TransactionClassificationService', () => {
    let service: TransactionClassificationService;

    beforeEach(() => {
        service = new TransactionClassificationService(DISPOSABLE_INCOME_TAG, PAYCHECK_TAG);
    });

    describe('isTransfer', () => {
        it('should return true for transfer transactions', () => {
            const transaction = transfer(1);
            expect(service.isTransfer(transaction)).toBe(true);
        });

        it('should return false for non-transfer transactions', () => {
            const transaction = deposit(1);
            expect(service.isTransfer(transaction)).toBe(false);
        });
    });

    describe('isBill', () => {
        it('should return true when transaction has bill_id', () => {
            const transaction = withdrawal(1, { bill_id: '123' });
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return true when transaction has subscription_id', () => {
            const transaction = withdrawal(1, { subscription_id: '456' });
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return true when transaction has both bill_id and subscription_id', () => {
            const transaction = withdrawal(1, { bill_id: '123', subscription_id: '456' });
            expect(service.isBill(transaction)).toBe(true);
        });

        it('should return false when transaction has no bill_id or subscription_id', () => {
            const transaction = withdrawal(1, { bill_id: undefined });
            expect(service.isBill(transaction)).toBe(false);
        });

        it('should return false when bill_id and subscription_id are null', () => {
            const transaction = withdrawal(1, { bill_id: null, subscription_id: null });
            expect(service.isBill(transaction)).toBe(false);
        });

        it('should return false when bill_id and subscription_id are undefined', () => {
            const transaction = withdrawal(1, { bill_id: undefined, subscription_id: undefined });
            expect(service.isBill(transaction)).toBe(false);
        });
    });

    describe('isDisposableIncome', () => {
        it('should return true when transaction has Disposable Income tag', () => {
            const transaction = withdrawal(1, { tags: [DISPOSABLE_INCOME_TAG] });
            expect(service.isDisposableIncome(transaction)).toBe(true);
        });

        it('should return false when transaction has no Disposable Income tag', () => {
            const transaction = withdrawal(1, { tags: ['other'] });
            expect(service.isDisposableIncome(transaction)).toBe(false);
        });

        it('should return false when transaction has no tags', () => {
            const transaction = withdrawal(1, { tags: undefined });
            expect(service.isDisposableIncome(transaction)).toBe(false);
        });
    });

    describe('isDeposit', () => {
        it('should return true for deposit transactions', () => {
            const transaction = deposit(1);
            expect(service.isDeposit(transaction)).toBe(true);
        });

        it('should return false for non-deposit transactions', () => {
            const transaction = withdrawal(1);
            expect(service.isDeposit(transaction)).toBe(false);
        });
    });

    describe('hasCategory', () => {
        it('should return true when transaction has category_id', () => {
            const transaction = withdrawal(1, { category_id: '123' });
            expect(service.hasCategory(transaction)).toBe(true);
        });

        it('should return false when category_id is undefined', () => {
            const transaction = withdrawal(1, { category_id: undefined });
            expect(service.hasCategory(transaction)).toBe(false);
        });

        it('should return false when category_id is null', () => {
            const transaction = withdrawal(1, { category_id: null });
            expect(service.hasCategory(transaction)).toBe(false);
        });
    });

    describe('hasBudget', () => {
        it('should return true when transaction has budget_id', () => {
            const transaction = withdrawal(1, { budget_id: '123' });
            expect(service.hasBudget(transaction)).toBe(true);
        });

        it('should return false when budget_id is undefined', () => {
            const transaction = withdrawal(1, { budget_id: undefined });
            expect(service.hasBudget(transaction)).toBe(false);
        });

        it('should return false when budget_id is null', () => {
            const transaction = withdrawal(1, { budget_id: null });
            expect(service.hasBudget(transaction)).toBe(false);
        });

        it('should return false when budget_id is empty', () => {
            const transaction = withdrawal(1, { budget_id: '' });
            expect(service.hasBudget(transaction)).toBe(false);
        });
    });

    describe('isPaycheck', () => {
        it('should return true when transaction has paycheck tag', () => {
            const transaction = withdrawal(1, { tags: [PAYCHECK_TAG] });
            expect(service.isPaycheck(transaction)).toBe(true);
        });

        it('should return true when transaction has paycheck tag with other tags', () => {
            const transaction = withdrawal(1, { tags: ['Work', PAYCHECK_TAG, 'Income'] });
            expect(service.isPaycheck(transaction)).toBe(true);
        });

        it('should return false when transaction does not have paycheck tag', () => {
            const transaction = withdrawal(1, { tags: ['Other', 'Tags'] });
            expect(service.isPaycheck(transaction)).toBe(false);
        });

        it('should return false when transaction has no tags', () => {
            const transaction = withdrawal(1, { tags: undefined });
            expect(service.isPaycheck(transaction)).toBe(false);
        });

        it('should return false when tags is null', () => {
            const transaction = withdrawal(1, { tags: null });
            expect(service.isPaycheck(transaction)).toBe(false);
        });

        it('should return false when tags is empty array', () => {
            const transaction = withdrawal(1, { tags: [] });
            expect(service.isPaycheck(transaction)).toBe(false);
        });

        it('should support custom paycheck tag name', () => {
            const customPaycheckTag = 'Salary';
            const customService = new TransactionClassificationService(
                DISPOSABLE_INCOME_TAG,
                customPaycheckTag
            );

            const transaction = withdrawal(1, { tags: [customPaycheckTag] });
            expect(customService.isPaycheck(transaction)).toBe(true);
        });

        it('should not match wrong tag name for custom paycheck tag', () => {
            const customPaycheckTag = 'Salary';
            const customService = new TransactionClassificationService(
                DISPOSABLE_INCOME_TAG,
                customPaycheckTag
            );

            const transaction = withdrawal(1, { tags: [PAYCHECK_TAG] });
            expect(customService.isPaycheck(transaction)).toBe(false);
        });
    });

    describe('classify', () => {
        // Checking and a card are the envelope; savings and the pool are outside
        const CHK = '1';
        const CC = '2';
        const SAV = '3';
        const POOL = '4';
        const scope: AccountScope = {
            envelope: new Set([CHK, CC]),
            income: new Set([CHK]),
        };
        const PAYCHECK = [PAYCHECK_TAG];
        const DISPOSABLE = [DISPOSABLE_INCOME_TAG];

        const cases: [string, TransactionSplit, Bucket | null][] = [
            // Withdrawals: the account decides scope, markers pick the bucket
            [
                '[R-BUCKET-1] unmarked card purchase',
                withdrawal(10, { source_id: CC }),
                'unbudgeted',
            ],
            [
                '[R-BUCKET-1] unmarked checking debit',
                withdrawal(10, { source_id: CHK }),
                'unbudgeted',
            ],
            [
                '[R-BUCKET-1] budgeted card purchase',
                withdrawal(10, { source_id: CC, budget_id: '9' }),
                'budget',
            ],
            [
                '[R-BUCKET-1] disposable beats budget',
                withdrawal(10, { source_id: CC, budget_id: '9', tags: DISPOSABLE }),
                'disposable',
            ],
            [
                '[R-BUCKET-1] bill beats budget and tag',
                withdrawal(10, { source_id: CC, bill_id: '7', budget_id: '9', tags: DISPOSABLE }),
                'bill',
            ],
            [
                '[R-BUCKET-1] subscription link is a bill',
                withdrawal(10, { source_id: CHK, subscription_id: '7' }),
                'bill',
            ],
            [
                '[R-SCOPE-2] budgeted savings withdrawal',
                withdrawal(10, { source_id: SAV, budget_id: '9' }),
                null,
            ],
            [
                '[R-SCOPE-2] bill paid from the pool',
                withdrawal(10, { source_id: POOL, bill_id: '7' }),
                null,
            ],
            [
                '[R-SCOPE-2] disposable-tagged savings withdrawal',
                withdrawal(10, { source_id: SAV, tags: DISPOSABLE }),
                null,
            ],
            ['[R-SCOPE-2] withdrawal with no source', withdrawal(10, { source_id: null }), null],

            ['[R-XFER-1] card payment', transfer(10, { source_id: CHK, destination_id: CC }), null],
            [
                '[R-XFER-2] savings top-up',
                transfer(10, { source_id: SAV, destination_id: CHK }),
                null,
            ],
            [
                '[R-XFER-2] pool reimbursement',
                transfer(10, { source_id: POOL, destination_id: CHK }),
                null,
            ],
            [
                '[R-XFER-3] extra to savings',
                transfer(10, { source_id: CHK, destination_id: SAV }),
                'unbudgeted',
            ],
            [
                '[R-XFER-3] pool top-up, whatever it is tagged',
                transfer(10, { source_id: CHK, destination_id: POOL, tags: DISPOSABLE }),
                'unbudgeted',
            ],
            [
                '[R-XFER-3] transfer with no destination',
                transfer(10, { source_id: CHK, destination_id: null }),
                'unbudgeted',
            ],
            [
                '[R-SCOPE-2] savings to pool',
                transfer(10, { source_id: SAV, destination_id: POOL }),
                null,
            ],

            [
                '[R-INCOME-1] paycheck into checking',
                deposit(10, { destination_id: CHK, tags: PAYCHECK }),
                'paycheck',
            ],
            [
                '[R-INCOME-1] freelance pay into checking',
                deposit(10, { destination_id: CHK }),
                'additionalIncome',
            ],
            [
                '[R-INCOME-2] stray paycheck tag on the savings half',
                deposit(10, { destination_id: SAV, tags: PAYCHECK }),
                null,
            ],
            ['[R-INCOME-2] pool interest', deposit(10, { destination_id: POOL }), null],
            [
                '[R-INCOME-2] paycheck tag on a card deposit',
                deposit(10, { destination_id: CC, tags: PAYCHECK }),
                'unbudgeted',
            ],

            [
                '[R-REFUND-1] unmarked card refund',
                deposit(10, { destination_id: CC }),
                'unbudgeted',
            ],
            [
                '[R-REFUND-1] disposable refund on the card',
                deposit(10, { destination_id: CC, tags: DISPOSABLE }),
                'disposable',
            ],
            [
                '[R-REFUND-1] disposable refund into checking',
                deposit(10, { destination_id: CHK, tags: DISPOSABLE }),
                'disposable',
            ],
            [
                '[R-REFUND-1] bill refund into checking',
                deposit(10, { destination_id: CHK, bill_id: '7' }),
                'bill',
            ],
            [
                '[R-REFUND-1] paycheck tag wins over a marker',
                deposit(10, { destination_id: CHK, tags: [...PAYCHECK, ...DISPOSABLE] }),
                'paycheck',
            ],
        ];

        it.each(cases)('%s', (_name, transaction, expected) => {
            expect(service.classify(transaction, scope)).toBe(expected);
        });

        it('should count an unknown transaction type nowhere', () => {
            const opening = withdrawal(10, { source_id: CHK });
            opening.type = 'opening balance' as TransactionSplit['type'];
            expect(service.classify(opening, scope)).toBeNull();
        });
    });
});
