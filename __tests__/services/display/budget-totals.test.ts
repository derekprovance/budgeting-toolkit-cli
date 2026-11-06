import { budgetTotals } from '../../../src/services/display/budget-totals.js';
import { BudgetReportDto } from '../../../src/types/dto/budget-report.dto.js';

const row = (amount: number, spent: number) => ({ amount, spent }) as BudgetReportDto;

describe('budgetTotals', () => {
    it('sums spent and allocated across every budget row', () => {
        expect(budgetTotals([row(400, 220), row(100, 30)])).toEqual({
            spent: 250,
            allocated: 500,
            percentageUsed: 50,
        });
    });

    it('reports zero percentage when nothing is allocated', () => {
        expect(budgetTotals([row(0, 50)])).toEqual({
            spent: 50,
            allocated: 0,
            percentageUsed: 0,
        });
    });
});
