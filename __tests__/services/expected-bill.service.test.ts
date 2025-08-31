import {
    Bill,
    BillArray,
    BillRead,
    BillRepeatFrequency,
    FireflyApiClient,
    FireflyApiError,
} from "@derekprovance/firefly-iii-sdk";
import { ExpectedBillService } from "../../src/services/expected-bill.service";

// Mock dependencies
jest.mock("../../src/logger");

describe("ExpectedBillService", () => {
    let service: ExpectedBillService;
    let mockApiClient: jest.Mocked<FireflyApiClient>;

    const createMockBill = (overrides: Partial<Bill> = {}): Bill => ({
        name: "Test Bill",
        amount_min: "100.00",
        amount_max: "150.00",
        date: "2024-01-15T00:00:00Z",
        repeat_freq: "monthly",
        active: true,
        skip: 0,
        ...overrides,
    });

    const createMockBillResponse = (bills: Bill[]): BillArray => ({
        data: bills.map(
            (bill) =>
                ({
                    type: "bills",
                    id: "1",
                    attributes: bill,
                }) as BillRead,
        ),
        meta: { pagination: {} },
    });

    beforeEach(() => {
        mockApiClient = {
            get: jest.fn(),
            post: jest.fn(),
            put: jest.fn(),
        } as unknown as jest.Mocked<FireflyApiClient>;
        service = new ExpectedBillService(mockApiClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe("getExpectedBillSumForMonth", () => {
        it("should validate month and year parameters", async () => {
            await expect(
                service.getExpectedBillSumForMonth(0, 2024),
            ).rejects.toThrow();
            await expect(
                service.getExpectedBillSumForMonth(13, 2024),
            ).rejects.toThrow();
            await expect(
                service.getExpectedBillSumForMonth(6, 24),
            ).rejects.toThrow();
        });

        it("should return 0 when no active bills", async () => {
            mockApiClient.get.mockResolvedValue(createMockBillResponse([]));

            const result = await service.getExpectedBillSumForMonth(6, 2024);

            expect(result).toBe(0);
            expect(mockApiClient.get).toHaveBeenCalledWith("/v1/bills");
        });

        it("should only include active bills", async () => {
            const bills = [
                createMockBill({
                    name: "Active Bill",
                    active: true,
                    amount_max: "100.00",
                }),
                createMockBill({
                    name: "Inactive Bill",
                    active: false,
                    amount_max: "200.00",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getExpectedBillSumForMonth(6, 2024);

            expect(result).toBe(100);
        });

        it("should calculate monthly bills correctly", async () => {
            const bills = [
                createMockBill({
                    name: "Monthly Bill 1",
                    amount_max: "100.00",
                    date: "2024-01-15T00:00:00Z",
                    repeat_freq: "monthly",
                }),
                createMockBill({
                    name: "Monthly Bill 2",
                    amount_max: "50.00",
                    date: "2024-02-01T00:00:00Z",
                    repeat_freq: "monthly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getExpectedBillSumForMonth(6, 2024);

            expect(result).toBe(150);
        });

        it("should handle quarterly bills correctly", async () => {
            const bills = [
                createMockBill({
                    name: "Quarterly Bill",
                    amount_max: "300.00",
                    date: "2024-03-01T00:00:00Z", // March
                    repeat_freq: "quarterly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            // Should be due in March, June, September, December
            expect(await service.getExpectedBillSumForMonth(3, 2024)).toBe(300);
            expect(await service.getExpectedBillSumForMonth(6, 2024)).toBe(300);
            expect(await service.getExpectedBillSumForMonth(4, 2024)).toBe(0);
            expect(await service.getExpectedBillSumForMonth(5, 2024)).toBe(0);
        });

        it("should handle yearly bills correctly", async () => {
            const bills = [
                createMockBill({
                    name: "Yearly Bill",
                    amount_max: "1200.00",
                    date: "2023-06-01T00:00:00Z", // June
                    repeat_freq: "yearly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            expect(await service.getExpectedBillSumForMonth(6, 2024)).toBe(
                1200,
            );
            expect(await service.getExpectedBillSumForMonth(5, 2024)).toBe(0);
            expect(await service.getExpectedBillSumForMonth(7, 2024)).toBe(0);
        });

        it("should handle bills with skip patterns", async () => {
            const bills = [
                createMockBill({
                    name: "Bi-monthly Bill",
                    amount_max: "200.00",
                    date: "2024-01-01T00:00:00Z",
                    repeat_freq: "monthly",
                    skip: 1, // Every other month
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            // Should be due in January, March, May, July, etc.
            expect(await service.getExpectedBillSumForMonth(1, 2024)).toBe(200);
            expect(await service.getExpectedBillSumForMonth(2, 2024)).toBe(0);
            expect(await service.getExpectedBillSumForMonth(3, 2024)).toBe(200);
            expect(await service.getExpectedBillSumForMonth(4, 2024)).toBe(0);
        });

        it("should exclude bills with end_date before target month", async () => {
            const bills = [
                createMockBill({
                    name: "Ended Bill",
                    amount_max: "100.00",
                    date: "2024-01-01T00:00:00Z",
                    end_date: "2024-05-31T00:00:00Z",
                    repeat_freq: "monthly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            expect(await service.getExpectedBillSumForMonth(5, 2024)).toBe(100);
            expect(await service.getExpectedBillSumForMonth(6, 2024)).toBe(0);
        });

        it("should handle bills starting after target month", async () => {
            const bills = [
                createMockBill({
                    name: "Future Bill",
                    amount_max: "100.00",
                    date: "2024-07-01T00:00:00Z",
                    repeat_freq: "monthly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            expect(await service.getExpectedBillSumForMonth(6, 2024)).toBe(0);
            expect(await service.getExpectedBillSumForMonth(7, 2024)).toBe(100);
            expect(await service.getExpectedBillSumForMonth(8, 2024)).toBe(100);
        });

        it("should handle API errors", async () => {
            mockApiClient.get.mockRejectedValue(
                new FireflyApiError("API Error", 500),
            );

            await expect(
                service.getExpectedBillSumForMonth(6, 2024),
            ).rejects.toThrow(
                "Failed to calculate expected bill sum for 6/2024",
            );
        });

        it("should use cached data on subsequent calls", async () => {
            const bills = [createMockBill({ amount_max: "100.00" })];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            await service.getExpectedBillSumForMonth(6, 2024);
            await service.getExpectedBillSumForMonth(7, 2024);

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
        });
    });

    describe("getAverageMonthlyBillsForYear", () => {
        it("should validate year parameter", async () => {
            await expect(
                service.getAverageMonthlyBillsForYear(24),
            ).rejects.toThrow();
        });

        it("should return 0 when no active bills", async () => {
            mockApiClient.get.mockResolvedValue(createMockBillResponse([]));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(0);
        });

        it("should calculate monthly average for monthly bills", async () => {
            const bills = [
                createMockBill({
                    name: "Monthly Bill",
                    amount_max: "120.00",
                    repeat_freq: "monthly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(120); // 120 * 12 / 12 = 120
        });

        it("should calculate monthly average for quarterly bills", async () => {
            const bills = [
                createMockBill({
                    name: "Quarterly Bill",
                    amount_max: "300.00",
                    repeat_freq: "quarterly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(100); // 300 * 4 / 12 = 100
        });

        it("should calculate monthly average for yearly bills", async () => {
            const bills = [
                createMockBill({
                    name: "Yearly Bill",
                    amount_max: "1200.00",
                    repeat_freq: "yearly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(100); // 1200 * 1 / 12 = 100
        });

        it("should calculate monthly average for weekly bills", async () => {
            const bills = [
                createMockBill({
                    name: "Weekly Bill",
                    amount_max: "25.00",
                    repeat_freq: "weekly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBeCloseTo(108.33, 2); // 25 * 52 / 12 = 108.33
        });

        it("should handle bills with skip patterns", async () => {
            const bills = [
                createMockBill({
                    name: "Bi-monthly Bill",
                    amount_max: "240.00",
                    repeat_freq: "monthly",
                    skip: 1, // Every other month = 6 times per year
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(120); // 240 * 6 / 12 = 120
        });

        it("should exclude bills starting after target year", async () => {
            const bills = [
                createMockBill({
                    name: "Future Bill",
                    amount_max: "100.00",
                    date: "2025-01-01T00:00:00Z",
                    repeat_freq: "monthly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(0);
        });

        it("should exclude bills ending before target year", async () => {
            const bills = [
                createMockBill({
                    name: "Past Bill",
                    amount_max: "100.00",
                    date: "2022-01-01T00:00:00Z",
                    end_date: "2023-12-31T00:00:00Z",
                    repeat_freq: "monthly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            expect(result).toBe(0);
        });

        it("should handle mixed bill frequencies", async () => {
            const bills = [
                createMockBill({
                    name: "Monthly Bill",
                    amount_max: "100.00",
                    repeat_freq: "monthly",
                }),
                createMockBill({
                    name: "Quarterly Bill",
                    amount_max: "300.00",
                    repeat_freq: "quarterly",
                }),
                createMockBill({
                    name: "Yearly Bill",
                    amount_max: "600.00",
                    repeat_freq: "yearly",
                }),
            ];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            const result = await service.getAverageMonthlyBillsForYear(2024);

            // Monthly: 100 * 12 = 1200
            // Quarterly: 300 * 4 = 1200
            // Yearly: 600 * 1 = 600
            // Total yearly: 3000
            // Monthly average: 3000 / 12 = 250
            expect(result).toBe(250);
        });

        it("should handle API errors", async () => {
            mockApiClient.get.mockRejectedValue(
                new FireflyApiError("API Error", 500),
            );

            await expect(
                service.getAverageMonthlyBillsForYear(2024),
            ).rejects.toThrow(
                "Failed to calculate average monthly bills for 2024",
            );
        });
    });

    describe("caching", () => {
        it("should cache bills data for 5 minutes", async () => {
            const bills = [createMockBill({ amount_max: "100.00" })];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            await service.getExpectedBillSumForMonth(6, 2024);
            await service.getAverageMonthlyBillsForYear(2024);

            expect(mockApiClient.get).toHaveBeenCalledTimes(1);
        });

        it("should refresh cache after TTL expires", async () => {
            const bills = [createMockBill({ amount_max: "100.00" })];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            // Mock Date.now to simulate time passing
            const originalDateNow = Date.now;
            let mockTime = 1000000;
            Date.now = jest.fn(() => mockTime);

            await service.getExpectedBillSumForMonth(6, 2024);

            // Advance time by 6 minutes (beyond 5-minute TTL)
            mockTime += 6 * 60 * 1000;

            await service.getExpectedBillSumForMonth(7, 2024);

            expect(mockApiClient.get).toHaveBeenCalledTimes(2);

            // Restore original Date.now
            Date.now = originalDateNow;
        });
    });

    describe("error handling", () => {
        it("should handle invalid amount formats", async () => {
            const bills = [createMockBill({ amount_max: "not-a-number" })];
            mockApiClient.get.mockResolvedValue(createMockBillResponse(bills));

            await expect(
                service.getExpectedBillSumForMonth(6, 2024),
            ).rejects.toThrow(
                "Failed to calculate expected bill sum for 6/2024",
            );
        });

        it("should handle missing bills data from API", async () => {
            mockApiClient.get.mockResolvedValue({ data: null } as any);

            await expect(
                service.getExpectedBillSumForMonth(6, 2024),
            ).rejects.toThrow(
                "Failed to calculate expected bill sum for 6/2024",
            );
        });
    });
});
