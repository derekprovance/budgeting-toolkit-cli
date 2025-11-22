import { BillService } from '../../../src/services/core/bill.service.js';
import { BillRead } from '@derekprovance/firefly-iii-sdk';
import { jest } from '@jest/globals';

describe('BillService', () => {
    let billService: BillService;
    let mockClient: any;

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

        billService = new BillService(mockClient);
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
});
