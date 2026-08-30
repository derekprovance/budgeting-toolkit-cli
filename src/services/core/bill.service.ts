import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { IDateRangeService } from '../../types/interface/date-range.service.interface.js';
import { DateUtils } from '../../utils/date.utils.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';

export class BillService {
    constructor(
        private readonly client: FireflyClientWithCerts,
        private readonly dateRangeService: IDateRangeService
    ) {}

    async getBills(): Promise<BillRead[]> {
        return fetchAllPages(
            page => this.client.bills.listBill(undefined, PAGE_SIZE, page),
            'fetch bills'
        );
    }

    async getActiveBills(): Promise<BillRead[]> {
        const bills = await this.getBills();
        return bills.filter(bill => bill.attributes.active ?? false);
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
        const start = range.startDateString;
        const end = range.endDateString;

        return fetchAllPages(
            page => this.client.bills.listBill(undefined, PAGE_SIZE, page, start, end),
            'fetch bills'
        );
    }

    /**
     * Get active bills with pay_dates populated for the specified month.
     */
    async getActiveBillsForMonth(month: number, year: number): Promise<BillRead[]> {
        const bills = await this.getBillsForMonth(month, year);
        return bills.filter(bill => bill.attributes.active ?? false);
    }
}
