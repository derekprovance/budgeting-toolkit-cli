import { AnalyzeReportDto, AnalyzeReportInput } from '../../../src/types/dto/analyze-report.dto.js';
import { BillComparisonDto } from '../../../src/types/dto/bill-comparison.dto.js';
import { buckets } from '../../setup/mock-services.js';
import { deposit, transfer, withdrawal } from '../../shared/test-data.js';

const bills = (actualTotal: number, predictedTotal = actualTotal) =>
    BillComparisonDto.create(predictedTotal, actualTotal, [], 'USD', '$');

const create = (overrides: Partial<AnalyzeReportInput> = {}) =>
    AnalyzeReportDto.create({
        buckets: buckets(),
        billComparison: bills(0),
        budgetAllocated: 0,
        expectedMonthlyPaycheck: 0,
        month: 1,
        year: 2025,
        ...overrides,
    });

describe('AnalyzeReportDto', () => {
    describe('create() - net cash flow', () => {
        it('[R-PURPOSE-1] should be income into checking minus envelope spending', () => {
            const report = create({
                buckets: buckets({
                    paycheck: [deposit(5000)],
                    additionalIncome: [deposit(300)],
                    budget: [withdrawal(1200)],
                    unbudgeted: [withdrawal(150)],
                }),
                billComparison: bills(800),
            });

            // 5000 + 300 - 800 - 1200 - 150
            expect(report.netImpact).toBe(3150);
        });

        it('[R-DISP-1] should state disposable spending without netting it', () => {
            const report = create({
                buckets: buckets({
                    paycheck: [deposit(1000)],
                    disposable: [withdrawal(60), withdrawal(40), deposit(20)],
                }),
            });

            expect(report.netImpact).toBe(1000);
            expect(report.disposableIncome).toBe(80);
        });

        it('[R-DISP-1] should keep a negative disposable balance rather than flooring it', () => {
            const report = create({
                buckets: buckets({ disposable: [withdrawal(30), deposit(50)] }),
            });

            expect(report.disposableIncome).toBe(-20);
        });

        it('[R-REFUND-1] should let a refund reduce the bucket it lands in', () => {
            const report = create({
                buckets: buckets({ unbudgeted: [withdrawal(100), deposit(25)] }),
            });

            expect(report.unbudgetedExpenseTotal).toBe(75);
            expect(report.netImpact).toBe(-75);
        });

        it('[R-XFER-3] should charge a transfer out of the envelope as spending', () => {
            const report = create({
                buckets: buckets({ unbudgeted: [transfer(200)] }),
            });

            expect(report.unbudgetedExpenseTotal).toBe(200);
        });

        it('should report a deficit as a negative net', () => {
            const report = create({
                buckets: buckets({ paycheck: [deposit(1000)], budget: [withdrawal(1500)] }),
            });

            expect(report.netImpact).toBe(-500);
        });

        it('should ignore an unparseable amount rather than poison the total', () => {
            const report = create({
                buckets: buckets({
                    additionalIncome: [deposit(100), deposit('invalid'), deposit(200)],
                }),
            });

            expect(report.additionalIncomeTotal).toBe(300);
        });
    });

    describe('create() - variances', () => {
        it('[R-BUDGET-1] should report the budget surplus as allocated minus spent', () => {
            const report = create({
                buckets: buckets({ budget: [withdrawal(265)] }),
                budgetAllocated: 700,
            });

            expect(report.budgetSpent).toBe(265);
            expect(report.budgetSurplus).toBe(435);
        });

        it('should report the paycheck variance against the expected amount', () => {
            const report = create({
                buckets: buckets({ paycheck: [deposit(2000)] }),
                expectedMonthlyPaycheck: 2100,
            });

            expect(report.actualPaycheck).toBe(2000);
            expect(report.paycheckSurplus).toBe(-100);
        });
    });

    describe('create() - currency', () => {
        it('should take currency from the bill comparison', () => {
            const report = create({
                billComparison: BillComparisonDto.create(0, 0, [], 'EUR', '€'),
            });

            expect(report.currencyCode).toBe('EUR');
            expect(report.currencySymbol).toBe('€');
        });

        it('should fall back to USD when the bill comparison has none', () => {
            const report = create({
                billComparison: BillComparisonDto.create(0, 0, [], '', ''),
            });

            expect(report.currencyCode).toBe('USD');
            expect(report.currencySymbol).toBe('$');
        });
    });
});
