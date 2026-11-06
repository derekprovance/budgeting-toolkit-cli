import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { monthRange } from '../../utils/date.utils.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';

export class BillService {
    constructor(private readonly client: FireflyClientWithCerts) {}

    /**
     * Get all bills with pay_dates populated for the specified month.
     * When date range is provided, Firefly III populates the pay_dates array
     * with expected payment dates within that range.
     *
     * @param month - Month number (1-12)
     * @param year - Four-digit year
     * @returns Promise resolving to array of BillRead with populated pay_dates
     * @throws Error if month/year is invalid or the API fails
     */
    async getBillsForMonth(month: number, year: number): Promise<BillRead[]> {
        const { start, end } = monthRange(month, year);

        return fetchAllPages(
            page => this.client.bills.listBill(undefined, PAGE_SIZE, page, start, end),
            'fetch bills'
        );
    }
}
