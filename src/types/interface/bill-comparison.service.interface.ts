import { BillComparisonDto } from '../dto/bill-comparison.dto.js';
import { Result } from '../result.type.js';
import { BillError } from '../error/bill.error.js';

export interface BillComparisonService {
    /**
     * Calculate bill comparison for a given month and year
     * @param month - Month (1-12)
     * @param year - Year
     * @returns Result containing bill comparison data or error
     */
    calculateBillComparison(
        month: number,
        year: number
    ): Promise<Result<BillComparisonDto, BillError>>;
}
