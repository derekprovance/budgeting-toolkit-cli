import { jest } from '@jest/globals';
import {
    createAnalyzeCommand,
    createBudgetReportCommand,
} from '../../src/factories/command.factory.js';
import { AnalyzeCommand } from '../../src/commands/analyze.command.js';
import { BudgetReportCommand } from '../../src/commands/budget-report.command.js';
import { BillComparisonDto } from '../../src/types/dto/bill-comparison.dto.js';
import type { AppServices } from '../../src/factories/service.factory.js';
import { DEFAULT_CONFIG } from '../../src/config/config.defaults.js';
import { buckets, createMockCashFlowService } from '../setup/mock-services.js';
import { deposit, withdrawal } from '../shared/test-data.js';

const ok = <T>(value: T) => ({ ok: true as const, value });

describe('command factory', () => {
    let consoleLogSpy: jest.Spied<typeof console.log>;
    let stderrSpy: jest.Spied<typeof process.stderr.write>;

    const bills = new BillComparisonDto(0, 0, 0, [], 'USD', '$');

    const config = structuredClone(DEFAULT_CONFIG);
    config.transactions.expectedMonthlyPaycheck = 2000;

    /** Only the services the two report commands call, each a stub */
    const services = {
        cashFlowService: createMockCashFlowService(
            buckets({ paycheck: [deposit(2000)], budget: [withdrawal(40)] })
        ),
        billComparisonService: { calculateBillComparison: jest.fn(async () => ok(bills)) },
        budgetService: { getBudgetLimits: jest.fn(async () => []) },
        analyzeDisplayService: { formatAnalysisReport: jest.fn(() => 'analyze text') },
        transactionService: { getMostRecentTransactionDate: jest.fn(async () => null) },
        budgetAnalyticsService: {
            getBudgetReport: jest.fn(async () => []),
            getTopExpenses: jest.fn(async () => []),
        },
        budgetInsightService: { generateInsights: jest.fn(() => []) },
        budgetDisplayService: { formatReport: jest.fn(() => 'report text') },
    } as unknown as AppServices;

    beforeEach(() => {
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        stderrSpy.mockRestore();
    });

    it('wires AnalyzeCommand to the supplied services', async () => {
        const command = createAnalyzeCommand(services, config);
        expect(command).toBeInstanceOf(AnalyzeCommand);

        const dto = await command.execute({ month: 1, year: 2025 });

        expect(services.cashFlowService.getBuckets).toHaveBeenCalledWith(1, 2025);
        expect(dto.expectedMonthlyPaycheck).toBe(2000);
        expect(services.analyzeDisplayService.formatAnalysisReport).toHaveBeenCalledWith(
            dto,
            false
        );
        expect(dto.netImpact).toBe(2000 - 40);
        expect(consoleLogSpy).toHaveBeenCalledWith('analyze text');
    });

    it('wires BudgetReportCommand to the supplied services', async () => {
        const command = createBudgetReportCommand(services);
        expect(command).toBeInstanceOf(BudgetReportCommand);

        const result = await command.execute({ month: 1, year: 2025, format: 'json' });

        expect(services.cashFlowService.getBuckets).toHaveBeenCalledWith(1, 2025);
        expect(result.billComparison).toBe(bills);
        expect(JSON.parse(consoleLogSpy.mock.calls[0][0] as string).schemaVersion).toBe(2);
    });
});
