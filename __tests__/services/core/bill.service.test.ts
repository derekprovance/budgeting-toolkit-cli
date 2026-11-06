import { PAGE_SIZE } from '../../../src/utils/pagination.utils.js';
import { BillService } from '../../../src/services/core/bill.service.js';
import { BillArray, BillRead } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs.js';
import { createMockFireflyClient } from '../../shared/mocks.js';

/** One page of bills; the service reads only `data`. */
const billPage = (data: BillRead[]) => ({ data }) as BillArray;

describe('BillService', () => {
    let billService: BillService;
    let mockClient: jest.Mocked<FireflyClientWithCerts>;

    const mockBill: BillRead = {
        type: 'bills',
        id: '1',
        attributes: {
            name: 'Test Bill',
            active: true,
            amount_min: '100',
            amount_max: '150',
            repeat_freq: 'monthly',
            date: '2024-01-01',
        },
    };

    beforeEach(() => {
        mockClient = createMockFireflyClient();

        billService = new BillService(mockClient);
    });

    describe('getBillsForMonth', () => {
        it('should fetch bills with date range parameters', async () => {
            const billWithPayDates: BillRead = {
                ...mockBill,
                attributes: {
                    ...mockBill.attributes,
                    pay_dates: ['2024-10-15'],
                },
            };

            mockClient.bills.listBill.mockResolvedValue(billPage([billWithPayDates]));

            const result = await billService.getBillsForMonth(10, 2024);

            expect(mockClient.bills.listBill).toHaveBeenCalledWith(
                undefined, // xTraceId
                PAGE_SIZE,
                1, // page
                '2024-10-01', // start date
                '2024-10-31' // end date
            );
            expect(result).toEqual([billWithPayDates]);
        });

        it('should handle different months correctly', async () => {
            mockClient.bills.listBill.mockResolvedValue(billPage([mockBill]));

            await billService.getBillsForMonth(2, 2024);

            expect(mockClient.bills.listBill).toHaveBeenCalledWith(
                undefined,
                PAGE_SIZE,
                1,
                '2024-02-01',
                '2024-02-29' // 2024 is a leap year
            );
        });

        it('should handle December correctly (month 12)', async () => {
            mockClient.bills.listBill.mockResolvedValue(billPage([mockBill]));

            await billService.getBillsForMonth(12, 2024);

            expect(mockClient.bills.listBill).toHaveBeenCalledWith(
                undefined,
                PAGE_SIZE,
                1,
                '2024-12-01',
                '2024-12-31'
            );
        });

        it('should throw error when API returns no data', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: undefined,
            } as unknown as BillArray);

            await expect(billService.getBillsForMonth(10, 2024)).rejects.toThrow(
                'Failed to fetch bills'
            );
        });

        it('should throw error when API returns null', async () => {
            mockClient.bills.listBill.mockResolvedValue(null as unknown as BillArray);

            await expect(billService.getBillsForMonth(10, 2024)).rejects.toThrow(
                'Failed to fetch bills'
            );
        });

        it('should return empty array when no bills exist', async () => {
            mockClient.bills.listBill.mockResolvedValue(billPage([]));

            const result = await billService.getBillsForMonth(10, 2024);

            expect(result).toEqual([]);
        });

        it('should throw error for invalid month (0)', async () => {
            await expect(billService.getBillsForMonth(0, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
            expect(mockClient.bills.listBill).not.toHaveBeenCalled();
        });

        it('should throw error for invalid month (13)', async () => {
            await expect(billService.getBillsForMonth(13, 2024)).rejects.toThrow(
                'Month must be an integer between 1 and 12'
            );
            expect(mockClient.bills.listBill).not.toHaveBeenCalled();
        });

        it('should throw error for invalid year', async () => {
            await expect(billService.getBillsForMonth(10, -1)).rejects.toThrow(
                'Year must be a valid 4-digit year'
            );
            expect(mockClient.bills.listBill).not.toHaveBeenCalled();
        });
    });
});
