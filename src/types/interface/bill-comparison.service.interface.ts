import { BillComparisonDto } from '../dto/bill-comparison.dto';

export interface BillComparisonService {
    /**
     * Calculate bill comparison for a given month and year
     * @param month - Month (1-12)
     * @param year - Year
     * @returns Bill comparison data including predicted vs actual costs
     */
    calculateBillComparison(month: number, year: number): Promise<BillComparisonDto>;
}
