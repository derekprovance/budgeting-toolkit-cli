jest.mock('chalk', () => {
    const mockChalk = (text: string) => text;
    mockChalk.bold = mockChalk;
    mockChalk.cyan = mockChalk;
    mockChalk.dim = mockChalk;
    mockChalk.white = mockChalk;
    mockChalk.yellow = mockChalk;
    mockChalk.redBright = mockChalk;
    mockChalk.yellowBright = mockChalk;
    mockChalk.greenBright = mockChalk;
    mockChalk.gray = mockChalk;
    mockChalk.cyanBright = mockChalk;
    mockChalk.red = mockChalk;
    mockChalk.green = mockChalk;
    mockChalk.blue = mockChalk;
    return mockChalk;
});

import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { FinalizeBudgetDisplayService } from '../../../src/services/display/finalize-budget-display.service';
import { BaseTransactionDisplayService } from '../../../src/services/display/base-transaction-display.service';
import { TransactionClassificationService } from '../../../src/services/core/transaction-classification.service';
import { ExcludedTransactionService } from '../../../src/services/excluded-transaction.service';

jest.mock('../../../src/services/display/base-transaction-display.service');
jest.mock('../../../src/services/core/transaction-classification.service');
jest.mock('../../../src/services/excluded-transaction.service');

describe('FinalizeBudgetDisplayService', () => {
    let service: FinalizeBudgetDisplayService;
    let baseTransactionDisplayService: jest.Mocked<BaseTransactionDisplayService>;
    let transactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let excludedTransactionService: jest.Mocked<ExcludedTransactionService>;

    const mockTransaction: Partial<TransactionSplit> = {
        description: 'Test Transaction',
        amount: '100.00',
        date: '2024-05-15',
        currency_symbol: '$',
        category_name: 'Test Category',
    };

    beforeEach(() => {
        excludedTransactionService =
            new ExcludedTransactionService() as jest.Mocked<ExcludedTransactionService>;
        transactionClassificationService = new TransactionClassificationService(
            excludedTransactionService
        ) as jest.Mocked<TransactionClassificationService>;
        baseTransactionDisplayService = new BaseTransactionDisplayService(
            transactionClassificationService
        ) as jest.Mocked<BaseTransactionDisplayService>;

        // Mock the displayService methods
        baseTransactionDisplayService.listTransactionsWithHeader = jest
            .fn()
            .mockImplementation((transactions: TransactionSplit[], header: string) => {
                if (transactions.length === 0) {
                    const noDataMessage = header.includes('Income')
                        ? 'No additional income transactions found'
                        : 'No unbudgeted expense transactions found';
                    return `\n${header}\n\n${noDataMessage}`;
                }

                const total = transactions.reduce(
                    (sum: number, t: TransactionSplit) => sum + parseFloat(t.amount),
                    0
                );
                const typeIndicator = transactionClassificationService.isBill(transactions[0])
                    ? '[BILL]'
                    : transactionClassificationService.isTransfer(transactions[0])
                      ? '[TRANSFER]'
                      : transactionClassificationService.isDeposit(transactions[0])
                        ? '[DEPOSIT]'
                        : '[OTHER]';

                return `\n${header}\n\n${typeIndicator} ${transactions[0].description}\n${transactions[0].currency_symbol}${Math.abs(total).toFixed(2)}\n\nTotal ${header.includes('Income') ? 'Additional Income' : 'Unbudgeted Expenses'}: ${transactions[0].currency_symbol}${Math.abs(total).toFixed(2)}`;
            });

        service = new FinalizeBudgetDisplayService(baseTransactionDisplayService);
    });

    describe('formatHeader', () => {
        it('should format header correctly', () => {
            const result = service.formatHeader('Test Header');
            expect(result).toContain('Test Header');
            expect(result).toContain('╔');
            expect(result).toContain('╗');
            expect(result).toContain('╚');
            expect(result).toContain('╝');
        });
    });

    describe('formatMonthHeader', () => {
        it('should format month header correctly', () => {
            const result = service.formatMonthHeader(5, 2024);
            expect(result).toContain('Budget Report for May 2024');
        });
    });

    describe('formatAdditionalIncomeSection', () => {
        it('should format empty additional income section', () => {
            const result = service.formatAdditionalIncomeSection([]);
            expect(result).toContain('=== Additional Income ===');
            expect(result).toContain('No additional income transactions found');
        });

        it('should format additional income section with bill transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(true);
            const result = service.formatAdditionalIncomeSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Additional Income ===');
            expect(result).toContain('[BILL]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Additional Income');
        });

        it('should format additional income section with transfer transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(false);
            transactionClassificationService.isTransfer.mockReturnValueOnce(true);
            const result = service.formatAdditionalIncomeSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Additional Income ===');
            expect(result).toContain('[TRANSFER]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Additional Income');
        });

        it('should format additional income section with deposit transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(false);
            transactionClassificationService.isTransfer.mockReturnValueOnce(false);
            transactionClassificationService.isDeposit.mockReturnValueOnce(true);
            const result = service.formatAdditionalIncomeSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Additional Income ===');
            expect(result).toContain('[DEPOSIT]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Additional Income');
        });

        it('should format additional income section with other transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(false);
            transactionClassificationService.isTransfer.mockReturnValueOnce(false);
            transactionClassificationService.isDeposit.mockReturnValueOnce(false);
            const result = service.formatAdditionalIncomeSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Additional Income ===');
            expect(result).toContain('[OTHER]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Additional Income');
        });
    });

    describe('formatUnbudgetedExpensesSection', () => {
        it('should format empty unbudgeted expenses section', () => {
            const result = service.formatUnbudgetedExpensesSection([]);
            expect(result).toContain('=== Unbudgeted Expenses ===');
            expect(result).toContain('No unbudgeted expense transactions found');
        });

        it('should format unbudgeted expenses section with bill transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(true);
            const result = service.formatUnbudgetedExpensesSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Unbudgeted Expenses ===');
            expect(result).toContain('[BILL]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Unbudgeted Expenses');
        });

        it('should format unbudgeted expenses section with transfer transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(false);
            transactionClassificationService.isTransfer.mockReturnValueOnce(true);
            const result = service.formatUnbudgetedExpensesSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Unbudgeted Expenses ===');
            expect(result).toContain('[TRANSFER]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Unbudgeted Expenses');
        });

        it('should format unbudgeted expenses section with deposit transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(false);
            transactionClassificationService.isTransfer.mockReturnValueOnce(false);
            transactionClassificationService.isDeposit.mockReturnValueOnce(true);
            const result = service.formatUnbudgetedExpensesSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Unbudgeted Expenses ===');
            expect(result).toContain('[DEPOSIT]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Unbudgeted Expenses');
        });

        it('should format unbudgeted expenses section with other transaction', () => {
            transactionClassificationService.isBill.mockReturnValueOnce(false);
            transactionClassificationService.isTransfer.mockReturnValueOnce(false);
            transactionClassificationService.isDeposit.mockReturnValueOnce(false);
            const result = service.formatUnbudgetedExpensesSection([
                mockTransaction as TransactionSplit,
            ]);
            expect(result).toContain('=== Unbudgeted Expenses ===');
            expect(result).toContain('[OTHER]');
            expect(result).toContain('Test Transaction');
            expect(result).toContain('$100.00');
            expect(result).toContain('Total Unbudgeted Expenses');
        });
    });

    describe('formatSummary', () => {
        it('should format summary with all transaction types', () => {
            // Arrange
            const counts = {
                bills: 2,
                transfers: 3,
                deposits: 4,
                other: 1,
            };

            const additionalIncome = [
                {
                    amount: '100.00',
                    currency_symbol: '$',
                } as TransactionSplit,
            ];

            const unbudgetedExpenses = [
                {
                    amount: '-50.00',
                    currency_symbol: '$',
                } as TransactionSplit,
            ];

            // Act
            const result = service.formatSummary(
                counts,
                additionalIncome,
                unbudgetedExpenses,
                500.0
            );

            // Assert
            expect(result).toContain('=== Transaction Summary ===');
            expect(result).toContain('💳 Bills:\t\t2');
            expect(result).toContain('↔️  Transfers:\t3');
            expect(result).toContain('💰 Deposits:\t4');
            expect(result).toContain('❓ Other:\t\t1');
            expect(result).toContain('Additional Income:     $100.00');
            expect(result).toContain('Unbudgeted Expenses:   -$50.00');
            expect(result).toContain('Paycheck Variance:     $500.00');
        });
    });
});
