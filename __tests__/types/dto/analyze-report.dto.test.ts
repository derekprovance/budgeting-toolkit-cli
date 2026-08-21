import { AnalyzeReportDto } from '../../../src/types/dto/analyze-report.dto.js';
import { BillComparisonDto } from '../../../src/types/dto/bill-comparison.dto.js';

describe('AnalyzeReportDto', () => {
    describe('create() - double-count correction', () => {
        const txn = (amount: string, description: string) =>
            ({ amount, description, type: 'withdrawal' }) as never;

        const billComparisonWithBudgeted = (
            actualTotal: number,
            budgetedTransactions: unknown[]
        ): BillComparisonDto =>
            ({
                predictedTotal: actualTotal,
                actualTotal,
                variance: 0,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
                budgetedTransactions,
                budgetedTotal: 0,
            }) as unknown as BillComparisonDto;

        const build = (
            billComparison: BillComparisonDto,
            disposableBudgeted: unknown[] = [],
            disposableIncome = 0
        ) =>
            AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500, // budgetSpent — already contains the overlapping transactions
                500,
                billComparison,
                5000,
                5000,
                0,
                [],
                [],
                disposableIncome,
                11,
                2025,
                disposableBudgeted as never[]
            );

        it('should add a bill/budget overlap back exactly once', () => {
            // A bill transaction carrying a budget is inside BOTH
            // billComparison.actualTotal and Firefly's budgetSpent rollup
            const dto = build(billComparisonWithBudgeted(950, [txn('39.00', 'LeetCode')]));

            // 5000 - 950 - 1500 = 2550, plus the $39 charged twice
            expect(dto.doubleCountedTotal).toBe(39);
            expect(dto.netImpact).toBe(2589);
        });

        it('should include disposable transactions that also carry a budget', () => {
            const dto = build(
                billComparisonWithBudgeted(950, [txn('39.00', 'LeetCode')]),
                [txn('20.00', 'Coffee')],
                100
            );

            expect(dto.doubleCountedTotal).toBe(59);
            expect(dto.doubleCountedTransactions).toHaveLength(2);
            // 5000 - 950 - 1500 - 100 (disposable) + 59
            expect(dto.netImpact).toBe(2509);
        });

        it('should be a no-op when nothing overlaps', () => {
            const dto = build(billComparisonWithBudgeted(950, []));

            expect(dto.doubleCountedTotal).toBe(0);
            expect(dto.doubleCountedTransactions).toEqual([]);
            expect(dto.netImpact).toBe(2550);
        });

        it('should tolerate a bill comparison without the budgeted fields', () => {
            const legacy = {
                predictedTotal: 1000,
                actualTotal: 950,
                variance: -50,
                bills: [],
                currencyCode: 'USD',
                currencySymbol: '$',
            } as BillComparisonDto;

            const dto = build(legacy);

            expect(dto.doubleCountedTotal).toBe(0);
            expect(dto.netImpact).toBe(2550);
        });
    });

    describe('create() - Net Impact Formula', () => {
        const createMockBillComparison = (
            predictedTotal: number = 1000,
            actualTotal: number = 1000
        ): BillComparisonDto => ({
            predictedTotal,
            actualTotal,
            variance: actualTotal - predictedTotal,
            bills: [],
            currencyCode: 'USD',
            currencySymbol: '$',
        });

        it('should calculate netImpact as true cash flow: income - expenses', () => {
            const dto = AnalyzeReportDto.create(
                [], // additionalIncome
                [], // unbudgetedExpenses
                2000, // budgetAllocated
                1500, // budgetSpent
                500, // budgetSurplus (unused in new formula)
                createMockBillComparison(1000, 950),
                5000, // expectedMonthlyPaycheck
                5000, // actualPaycheck
                0, // paycheckSurplus (unused in new formula)
                [], // disposableIncomeTransactions
                [], // disposableIncomeTransfers
                0, // disposableIncome
                11, // month
                2025 // year
            );

            // Formula: actualPaycheck + additionalIncome - actualBills - budgetSpent - unbudgeted - disposable
            // = 5000 + 0 - 950 - 1500 - 0 - 0 = 2550
            expect(dto.netImpact).toBe(2550);
        });

        it('should include additional income in netImpact', () => {
            const dto = AnalyzeReportDto.create(
                [{ amount: '750' }], // additionalIncome (1 transaction)
                [],
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            // = 5000 + 750 - 950 - 1500 - 0 - 0 = 3300
            expect(dto.netImpact).toBe(3300);
        });

        it('should subtract unbudgeted expenses from netImpact', () => {
            const dto = AnalyzeReportDto.create(
                [],
                [{ amount: '-200' }, { amount: '-100' }], // unbudgetedExpenses
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            // = 5000 + 0 - 950 - 1500 - 300 - 0 = 2250
            expect(dto.netImpact).toBe(2250);
        });

        it('should subtract disposable income from netImpact', () => {
            const dto = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5000,
                0,
                [{ amount: '-300' }], // disposableIncomeTransactions
                [],
                300, // disposableIncome
                11,
                2025
            );

            // = 5000 + 0 - 950 - 1500 - 0 - 300 = 2250
            expect(dto.netImpact).toBe(2250);
        });

        it('should handle paycheck below expected (negative paycheckSurplus)', () => {
            const dto = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                4800, // actualPaycheck less than expected
                -200, // paycheckSurplus (calculated outside, not used in formula)
                [],
                [],
                0,
                11,
                2025
            );

            // = 4800 + 0 - 950 - 1500 - 0 - 0 = 2350 (full actual paycheck, not adjusted)
            expect(dto.netImpact).toBe(2350);
        });

        it('should handle paycheck above expected (positive paycheckSurplus)', () => {
            const dto = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5300, // actualPaycheck more than expected
                300, // paycheckSurplus (calculated outside, not used in formula)
                [],
                [],
                0,
                11,
                2025
            );

            // = 5300 + 0 - 950 - 1500 - 0 - 0 = 2850 (full actual paycheck)
            expect(dto.netImpact).toBe(2850);
        });

        it('should handle negative netImpact (deficit)', () => {
            const dto = AnalyzeReportDto.create(
                [],
                [{ amount: '-500' }],
                2000,
                1800, // high budget spend
                200,
                createMockBillComparison(1000, 1200), // bills overspent
                5000,
                5000,
                0,
                [{ amount: '-400' }],
                [],
                400,
                11,
                2025
            );

            // = 5000 + 0 - 1200 - 1800 - 500 - 400 = 1100 (still positive but tight margin)
            expect(dto.netImpact).toBe(1100);
        });

        it('should handle zero netImpact (break even)', () => {
            const dto = AnalyzeReportDto.create(
                [],
                [],
                3400,
                3400, // budgetSpent = budgetAllocated
                0,
                createMockBillComparison(1600, 1600), // bills match prediction
                5000,
                5000, // paycheck matches expected
                0,
                [],
                [],
                0,
                11,
                2025
            );

            // = 5000 + 0 - 1600 - 3400 - 0 - 0 = 0
            expect(dto.netImpact).toBe(0);
        });

        it('should ignore budgetSurplus and paycheckSurplus in formula (variance-based values unused)', () => {
            // These used to be part of the calculation but are now unused
            const dtoWithVariances = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                500, // budgetSurplus (now unused)
                createMockBillComparison(1000, 950),
                5000,
                5000,
                200, // paycheckSurplus (now unused)
                [],
                [],
                0,
                11,
                2025
            );

            const dtoWithoutVariances = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                -9999, // different budgetSurplus
                createMockBillComparison(1000, 950),
                5000,
                5000,
                -9999, // different paycheckSurplus
                [],
                [],
                0,
                11,
                2025
            );

            // Both should produce the same netImpact since variances are ignored
            expect(dtoWithVariances.netImpact).toBe(dtoWithoutVariances.netImpact);
            expect(dtoWithVariances.netImpact).toBe(2550);
        });

        it('should calculate additionalIncomeTotal from transaction amounts', () => {
            const additionalIncome = [{ amount: '100.50' }, { amount: '250.75' }, { amount: '50' }];

            const dto = AnalyzeReportDto.create(
                additionalIncome,
                [],
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            // additionalIncomeTotal should be 401.25 (100.50 + 250.75 + 50)
            expect(dto.additionalIncomeTotal).toBe(401.25);
            // = 5000 + 401.25 - 950 - 1500 - 0 - 0 = 2951.25
            expect(dto.netImpact).toBe(2951.25);
        });

        it('should calculate unbudgetedExpenseTotal from transaction amounts', () => {
            const unbudgetedExpenses = [{ amount: '-75' }, { amount: '-125' }, { amount: '-100' }];

            const dto = AnalyzeReportDto.create(
                [],
                unbudgetedExpenses,
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            // unbudgetedExpenseTotal should be 300 (sum of absolute values)
            expect(dto.unbudgetedExpenseTotal).toBe(300);
            // = 5000 + 0 - 950 - 1500 - 300 - 0 = 2250
            expect(dto.netImpact).toBe(2250);
        });

        it('should handle NaN amounts gracefully', () => {
            const additionalIncome = [
                { amount: '100' },
                { amount: 'invalid' }, // Will be NaN
                { amount: '200' },
            ];

            const dto = AnalyzeReportDto.create(
                additionalIncome,
                [],
                2000,
                1500,
                500,
                createMockBillComparison(1000, 950),
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            // additionalIncomeTotal should treat NaN as 0, so 100 + 0 + 200 = 300
            expect(dto.additionalIncomeTotal).toBe(300);
            // = 5000 + 300 - 950 - 1500 - 0 - 0 = 2850
            expect(dto.netImpact).toBe(2850);
        });

        it('should store currency info from billComparison', () => {
            const billComparison = createMockBillComparison(1000, 950);
            billComparison.currencySymbol = '€';
            billComparison.currencyCode = 'EUR';

            const dto = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                500,
                billComparison,
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            expect(dto.currencySymbol).toBe('€');
            expect(dto.currencyCode).toBe('EUR');
        });

        it('should use default currency if billComparison lacks currency info', () => {
            const billComparison: BillComparisonDto = {
                predictedTotal: 1000,
                actualTotal: 950,
                variance: -50,
                bills: [],
                currencyCode: undefined as any,
                currencySymbol: undefined as any,
            };

            const dto = AnalyzeReportDto.create(
                [],
                [],
                2000,
                1500,
                500,
                billComparison,
                5000,
                5000,
                0,
                [],
                [],
                0,
                11,
                2025
            );

            expect(dto.currencySymbol).toBe('$');
            expect(dto.currencyCode).toBe('USD');
        });
    });
});
