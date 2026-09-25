import { PAGE_SIZE } from '../../../src/utils/pagination.utils.js';
import { BillService } from '../../../src/services/core/bill.service.js';
import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';
import { IDateRangeService } from '../../../src/types/interface/date-range.service.interface.js';
import { DateRangeService } from '../../../src/services/core/date-range.service.js';

describe('BillService', () => {
    let billService: BillService;
    let mockClient: any;
    let mockDateRangeService: jest.Mocked<IDateRangeService>;

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
        const mockListBill = jest.fn();
        const mockGetBill = jest.fn();

        mockClient = {
            bills: {
                listBill: mockListBill,
                getBill: mockGetBill,
            },
        } as any;

        mockDateRangeService = {
            getDateRange: jest.fn((month: number, year: number) =>
                new DateRangeService().getDateRange(month, year)
            ),
        } as jest.Mocked<IDateRangeService>;

        billService = new BillService(mockClient, mockDateRangeService);
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

            mockClient.bills.listBill.mockResolvedValue({
                data: [billWithPayDates],
            });

            const result = await billService.getBillsForMonth(10, 2024);

            // Verify listBill was called with date range parameters
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
            mockClient.bills.listBill.mockResolvedValue({
                data: [mockBill],
            });

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
            mockClient.bills.listBill.mockResolvedValue({
                data: [mockBill],
            });

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
            } as any);

            await expect(billService.getBillsForMonth(10, 2024)).rejects.toThrow(
                'Failed to fetch bills'
            );
        });

        it('should throw error when API returns null', async () => {
            mockClient.bills.listBill.mockResolvedValue(null as any);

            await expect(billService.getBillsForMonth(10, 2024)).rejects.toThrow(
                'Failed to fetch bills'
            );
        });

        it('should return empty array when no bills exist', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: [],
            });

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
