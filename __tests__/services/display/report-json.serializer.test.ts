import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import {
    toBillTotalsJson,
    toTransactionJson,
} from '../../../src/services/display/report-json.serializer.js';
import { BillComparisonDto } from '../../../src/types/dto/bill-comparison.dto.js';

const tx = (overrides: Partial<TransactionSplit>): TransactionSplit =>
    ({
        transaction_journal_id: 'j0',
        description: 'Transaction',
        type: 'withdrawal',
        amount: '0.00',
        date: '2025-01-15T00:00:00+00:00',
        source_id: 'cc',
        destination_id: 'shop',
        budget_id: null,
        bill_id: null,
        ...overrides,
    }) as TransactionSplit;

describe('toTransactionJson', () => {
    it('keeps the amount unsigned and maps ids to null when absent', () => {
        expect(
            toTransactionJson(
                tx({
                    transaction_journal_id: undefined,
                    type: 'deposit',
                    amount: '20.000000000000',
                    source_id: null,
                    destination_id: null,
                    budget_id: undefined,
                    bill_id: undefined,
                })
            )
        ).toEqual({
            journalId: '',
            description: 'Transaction',
            type: 'deposit',
            amount: 20,
            date: '2025-01-15T00:00:00+00:00',
            sourceId: null,
            destinationId: null,
            budgetId: null,
            billId: null,
        });
    });

    it('falls back to subscription_id for the bill link', () => {
        expect(toTransactionJson(tx({ bill_id: null, subscription_id: 's9' })).billId).toBe('s9');
    });
});

describe('toBillTotalsJson', () => {
    it('rounds the predicted, actual and variance totals to cents', () => {
        expect(
            toBillTotalsJson(new BillComparisonDto(240.004, 290.126, 50.122, [], 'USD', '$'))
        ).toEqual({ predicted: 240, actual: 290.13, variance: 50.12 });
    });
});
