import { TEST_DATE, deposit, withdrawal } from '../../shared/test-data.js';
import {
    toBillTotalsJson,
    toTransactionJson,
} from '../../../src/services/display/report-json.serializer.js';
import { BillComparisonDto } from '../../../src/types/dto/bill-comparison.dto.js';

describe('toTransactionJson', () => {
    it('keeps the amount unsigned and maps ids to null when absent', () => {
        expect(
            toTransactionJson(
                deposit('20.000000000000', {
                    description: 'Transaction',
                    transaction_journal_id: undefined,
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
            date: TEST_DATE,
            sourceId: null,
            destinationId: null,
            budgetId: null,
            billId: null,
        });
    });

    it('falls back to subscription_id for the bill link', () => {
        expect(
            toTransactionJson(withdrawal(0, { bill_id: null, subscription_id: 's9' })).billId
        ).toBe('s9');
    });
});

describe('toBillTotalsJson', () => {
    it('rounds the predicted, actual and variance totals to cents', () => {
        expect(
            toBillTotalsJson(new BillComparisonDto(240.004, 290.126, 50.122, [], 'USD', '$'))
        ).toEqual({ predicted: 240, actual: 290.13, variance: 50.12 });
    });
});
