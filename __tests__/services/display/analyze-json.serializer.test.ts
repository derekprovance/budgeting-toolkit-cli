import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { serializeAnalyzeReport } from '../../../src/services/display/analyze-json.serializer.js';
import { AnalyzeReportDto } from '../../../src/types/dto/analyze-report.dto.js';
import { BillComparisonDto, BillDetailDto } from '../../../src/types/dto/bill-comparison.dto.js';
import { AnalyzeReportJson } from '../../../src/types/dto/report-json.types.js';

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

describe('serializeAnalyzeReport', () => {
    const freelance = tx({
        transaction_journal_id: 'a1',
        description: 'Freelance',
        type: 'deposit',
        amount: '300.00',
        source_id: 'noname',
        destination_id: 'chk',
    });
    const coffee = tx({ transaction_journal_id: 'u1', description: 'Coffee', amount: '35.00' });
    const tagged = tx({
        transaction_journal_id: 'd1',
        description: 'Concert',
        amount: '40.00',
        budget_id: 'fun',
    });
    const refund = tx({
        transaction_journal_id: 'd2',
        description: 'Concert refund',
        type: 'deposit',
        amount: '20.00',
        source_id: 'venue',
        destination_id: 'cc',
    });

    const billComparison = new BillComparisonDto(
        240,
        290,
        50,
        [
            new BillDetailDto('electric', 'Electric', 100, 110, 'monthly'),
            new BillDetailDto('oldgym', 'Old Gym', 0, 40, 'monthly'),
        ],
        'USD',
        '$'
    );

    /** Hand-built: every field set directly, nothing derived by AnalyzeReportDto.create */
    const buildDto = (overrides: Partial<AnalyzeReportDto> = {}): AnalyzeReportDto =>
        Object.assign(
            new AnalyzeReportDto(
                [freelance],
                300,
                [coffee],
                35.0000000001,
                700,
                365,
                335,
                billComparison,
                2100,
                2000,
                -100,
                [tagged, refund],
                20,
                1975.9999999999998,
                1,
                2025,
                '$',
                'USD'
            ),
            overrides
        );

    it('builds the exact document from the DTO', () => {
        const expected: AnalyzeReportJson = {
            schemaVersion: 2,
            month: 1,
            year: 2025,
            currencyCode: 'USD',
            currencySymbol: '$',
            paycheck: { expected: 2100, actual: 2000, variance: -100 },
            additionalIncome: {
                total: 300,
                transactions: [
                    {
                        journalId: 'a1',
                        description: 'Freelance',
                        type: 'deposit',
                        amount: 300,
                        date: '2025-01-15T00:00:00+00:00',
                        sourceId: 'noname',
                        destinationId: 'chk',
                        budgetId: null,
                        billId: null,
                    },
                ],
            },
            unbudgetedExpenses: {
                total: 35,
                transactions: [
                    {
                        journalId: 'u1',
                        description: 'Coffee',
                        type: 'withdrawal',
                        amount: 35,
                        date: '2025-01-15T00:00:00+00:00',
                        sourceId: 'cc',
                        destinationId: 'shop',
                        budgetId: null,
                        billId: null,
                    },
                ],
            },
            budget: { allocated: 700, spent: 365, remaining: 335 },
            bills: {
                predicted: 240,
                actual: 290,
                variance: 50,
                bills: [
                    {
                        id: 'electric',
                        name: 'Electric',
                        predicted: 100,
                        actual: 110,
                        frequency: 'monthly',
                    },
                    {
                        id: 'oldgym',
                        name: 'Old Gym',
                        predicted: 0,
                        actual: 40,
                        frequency: 'monthly',
                    },
                ],
            },
            disposable: {
                balance: 20,
                transactions: [
                    {
                        journalId: 'd1',
                        description: 'Concert',
                        type: 'withdrawal',
                        amount: 40,
                        date: '2025-01-15T00:00:00+00:00',
                        sourceId: 'cc',
                        destinationId: 'shop',
                        budgetId: 'fun',
                        billId: null,
                    },
                    {
                        journalId: 'd2',
                        description: 'Concert refund',
                        type: 'deposit',
                        amount: 20,
                        date: '2025-01-15T00:00:00+00:00',
                        sourceId: 'venue',
                        destinationId: 'cc',
                        budgetId: null,
                        billId: null,
                    },
                ],
                action: { direction: 'fromPool', amount: 20 },
            },
            netCashFlow: 1976,
        };

        expect(serializeAnalyzeReport(buildDto())).toEqual(expected);
    });

    it('survives a JSON round trip unchanged', () => {
        const doc = serializeAnalyzeReport(buildDto());
        expect(JSON.parse(JSON.stringify(doc, null, 2))).toEqual(doc);
    });

    it('does not recompute the net from its parts', () => {
        // netImpact deliberately inconsistent with the other fields: the
        // serializer must report the DTO's number, not its own arithmetic
        expect(serializeAnalyzeReport(buildDto({ netImpact: 12.345 })).netCashFlow).toBe(12.35);
    });

    it('states a negative disposable balance as a return to the pool', () => {
        const doc = serializeAnalyzeReport(buildDto({ disposableIncome: -20 }));
        expect(doc.disposable.balance).toBe(-20);
        expect(doc.disposable.action).toEqual({ direction: 'toPool', amount: 20 });
    });

    it('has no action when the disposable balance is zero', () => {
        expect(
            serializeAnalyzeReport(buildDto({ disposableIncome: 0 })).disposable.action
        ).toBeNull();
        expect(
            serializeAnalyzeReport(buildDto({ disposableIncome: -0.0000001 })).disposable
        ).toMatchObject({ balance: 0, action: null });
    });
});
