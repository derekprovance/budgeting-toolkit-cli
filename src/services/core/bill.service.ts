import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { DateUtils } from '../../utils/date.utils.js';

export class BillService {
    constructor(
        private readonly client: FireflyClientWithCerts,
        private readonly dateRangeService: IDateRangeService
    ) {}

    async getBills(): Promise<BillRead[]> {
        const results = await this.client.bills.listBill();
        if (!results || !results.data) {
            throw new Error('Failed to fetch bills');
        }
        return results.data;
    }

    async getActiveBills(): Promise<BillRead[]> {
        const bills = await this.getBills();
        return bills.filter(bill => bill.attributes.active ?? false);
    }

    async getBill(id: string): Promise<BillRead> {
        if (!id || id.trim() === '') {
            throw new Error('Bill ID is required and cannot be empty');
        }

        const result = await this.client.bills.getBill(id);
        if (!result || !result.data) {
            throw new Error(`Failed to fetch bill with ID: ${id}`);
        }
        return result.data;
    }

    /**
     * Get all bills with pay_dates populated for the specified month.
     * When date range is provided, Firefly III populates the pay_dates array
     * with expected payment dates within that range.
     *
     * @param month - Month number (1-12)
     * @param year - Four-digit year
     * @returns Promise resolving to array of BillRead with populated pay_dates
     * @throws Error if month/year is invalid or API fails
     */
    async getBillsForMonth(month: number, year: number): Promise<BillRead[]> {
        DateUtils.validateMonthYear(month, year);
        const range = this.dateRangeService.getDateRange(month, year);
        const start = range.startDate.toISOString().split('T')[0];
        const end = range.endDate.toISOString().split('T')[0];

        const results = await this.client.bills.listBill(
            undefined,
            undefined,
            undefined,
            start,
            end
        );
        if (!results || !results.data) {
            throw new Error('Failed to fetch bills');
        }
        return results.data;
    }

    /**
     * Get active bills with pay_dates populated for the specified month.
     */
    async getActiveBillsForMonth(month: number, year: number): Promise<BillRead[]> {
        const bills = await this.getBillsForMonth(month, year);
        return bills.filter(bill => bill.attributes.active ?? false);
    }
}
