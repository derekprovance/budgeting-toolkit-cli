import { BillService } from '../../../src/services/core/bill.service.js';
import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';
import { IDateRangeService } from '../../../src/types/interface/date-range.service.interface.js';

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

    const mockInactiveBill: BillRead = {
        type: 'bills',
        id: '2',
        attributes: {
            name: 'Inactive Bill',
            active: false,
            amount_min: '50',
            amount_max: '50',
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
            getDateRange: jest.fn((month: number, year: number) => ({
                startDate: new Date(year, month - 1, 1),
                endDate: new Date(year, month, 0),
            })),
        } as jest.Mocked<IDateRangeService>;

        billService = new BillService(mockClient, mockDateRangeService);
    });

    describe('getBills', () => {
        it('should fetch all bills from API', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: [mockBill, mockInactiveBill],
            });

            const result = await billService.getBills();

            expect(mockClient.bills.listBill).toHaveBeenCalled();
            expect(result).toEqual([mockBill, mockInactiveBill]);
        });

        it('should throw error when API returns no data', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: undefined,
            } as any);

            await expect(billService.getBills()).rejects.toThrow('Failed to fetch bills');
        });

        it('should throw error when API returns null', async () => {
            mockClient.bills.listBill.mockResolvedValue(null as any);

            await expect(billService.getBills()).rejects.toThrow('Failed to fetch bills');
        });
    });

    describe('getActiveBills', () => {
        it('should filter only active bills', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: [mockBill, mockInactiveBill],
            });

            const result = await billService.getActiveBills();

            expect(result).toEqual([mockBill]);
            expect(result).toHaveLength(1);
            expect(result[0].attributes.active).toBe(true);
        });

        it('should return empty array when no active bills', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: [mockInactiveBill],
            });

            const result = await billService.getActiveBills();

            expect(result).toEqual([]);
        });

        it('should handle bills without active attribute (treat as inactive)', async () => {
            const billWithoutActive: BillRead = {
                type: 'bills',
                id: '3',
                attributes: {
                    name: 'Bill Without Active',
                    amount_min: '100',
                    amount_max: '100',
                    repeat_freq: 'monthly',
                },
            };

            mockClient.bills.listBill.mockResolvedValue({
                data: [billWithoutActive],
            });

            const result = await billService.getActiveBills();

            expect(result).toEqual([]);
        });

        it('should return all bills when all are active', async () => {
            const activeBill1 = { ...mockBill, id: '1' };
            const activeBill2 = { ...mockBill, id: '2' };

            mockClient.bills.listBill.mockResolvedValue({
                data: [activeBill1, activeBill2],
            });

            const result = await billService.getActiveBills();

            expect(result).toHaveLength(2);
        });
    });

    describe('getBill', () => {
        it('should fetch single bill by ID', async () => {
            mockClient.bills.getBill.mockResolvedValue({
                data: mockBill,
            });

            const result = await billService.getBill('1');

            expect(mockClient.bills.getBill).toHaveBeenCalledWith('1');
            expect(result).toEqual(mockBill);
        });

        it('should throw error for empty ID', async () => {
            await expect(billService.getBill('')).rejects.toThrow(
                'Bill ID is required and cannot be empty'
            );

            expect(mockClient.bills.getBill).not.toHaveBeenCalled();
        });

        it('should throw error for whitespace-only ID', async () => {
            await expect(billService.getBill('   ')).rejects.toThrow(
                'Bill ID is required and cannot be empty'
            );

            expect(mockClient.bills.getBill).not.toHaveBeenCalled();
        });

        it('should throw error when bill not found', async () => {
            mockClient.bills.getBill.mockResolvedValue({
                data: undefined,
            } as any);

            await expect(billService.getBill('999')).rejects.toThrow(
                'Failed to fetch bill with ID: 999'
            );
        });

        it('should throw error when API returns null', async () => {
            mockClient.bills.getBill.mockResolvedValue(null as any);

            await expect(billService.getBill('1')).rejects.toThrow(
                'Failed to fetch bill with ID: 1'
            );
        });
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
                undefined, // limit
                undefined, // page
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
                undefined,
                undefined,
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
                undefined,
                undefined,
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

    describe('getActiveBillsForMonth', () => {
        it('should filter only active bills for the specified month', async () => {
            const activeBillWithPayDates: BillRead = {
                ...mockBill,
                attributes: {
                    ...mockBill.attributes,
                    active: true,
                    pay_dates: ['2024-10-15'],
                },
            };
            const inactiveBillWithPayDates: BillRead = {
                ...mockInactiveBill,
                attributes: {
                    ...mockInactiveBill.attributes,
                    active: false,
                    pay_dates: ['2024-10-20'],
                },
            };

            mockClient.bills.listBill.mockResolvedValue({
                data: [activeBillWithPayDates, inactiveBillWithPayDates],
            });

            const result = await billService.getActiveBillsForMonth(10, 2024);

            expect(result).toEqual([activeBillWithPayDates]);
            expect(result).toHaveLength(1);
        });

        it('should return empty array when no active bills for month', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: [mockInactiveBill],
            });

            const result = await billService.getActiveBillsForMonth(10, 2024);

            expect(result).toEqual([]);
        });

        it('should pass correct date range to API', async () => {
            mockClient.bills.listBill.mockResolvedValue({
                data: [],
            });

            await billService.getActiveBillsForMonth(6, 2025);

            expect(mockClient.bills.listBill).toHaveBeenCalledWith(
                undefined,
                undefined,
                undefined,
                '2025-06-01',
                '2025-06-30'
            );
        });

        it('should handle bills without active attribute as inactive', async () => {
            const billWithoutActive: BillRead = {
                type: 'bills',
                id: '3',
                attributes: {
                    name: 'Bill Without Active',
                    amount_min: '100',
                    amount_max: '100',
                    repeat_freq: 'monthly',
                    pay_dates: ['2024-10-10'],
                },
            };

            mockClient.bills.listBill.mockResolvedValue({
                data: [billWithoutActive],
            });

            const result = await billService.getActiveBillsForMonth(10, 2024);

            expect(result).toEqual([]);
        });
    });
});
