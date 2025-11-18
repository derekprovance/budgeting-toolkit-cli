import { BillRead } from '@derekprovance/firefly-iii-sdk';

export interface BillService {
    /**
     * Get all bills from Firefly III
     */
    getBills(): Promise<BillRead[]>;

    /**
     * Get all active bills (bills marked as active in Firefly III)
     */
    getActiveBills(): Promise<BillRead[]>;

    /**
     * Get a single bill by ID
     * @param id - Bill ID
     */
    getBill(id: string): Promise<BillRead>;
}
