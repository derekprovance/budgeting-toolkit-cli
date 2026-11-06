import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { monthRange } from '../../utils/date.utils.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';

export class BillService {
    constructor(private readonly client: FireflyClientWithCerts) {}

    /**
     * Firefly fills each bill's `pay_dates` only when a date range is given.
     *
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
