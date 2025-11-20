import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { BillService as IBillService } from '../../types/interface/bill.service.interface.js';

export class BillService implements IBillService {
    constructor(private readonly client: FireflyClientWithCerts) {}

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
}
