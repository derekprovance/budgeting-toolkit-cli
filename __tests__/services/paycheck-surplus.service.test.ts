import { PaycheckSurplusService } from '../../src/services/paycheck-surplus.service';
import { TransactionService } from '../../src/services/core/transaction.service';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { logger } from '../../src/logger';
import { DateUtils } from '../../src/utils/date.utils';
import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs';
import { ExcludedTransactionService } from '../../src/services/excluded-transaction.service';

jest.mock('../../src/services/core/transaction.service');
jest.mock('../../src/services/core/transaction-classification.service');
jest.mock('../../src/logger', () => {
    const mockLogger = {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    };
    return {
        logger: mockLogger,
    };
});
jest.mock('../../src/utils/date.utils');
jest.mock('../../src/config', () => ({
    expectedMonthlyPaycheck: '5000.00',
}));

describe('PaycheckSurplusService', () => {
    let service: PaycheckSurplusService;
    let mockTransactionService: jest.Mocked<TransactionService>;
    let mockTransactionClassificationService: jest.Mocked<TransactionClassificationService>;
    let mockApiClient: jest.Mocked<FireflyClientWithCerts>;
    let mockExcludedTransactionService: jest.Mocked<ExcludedTransactionService>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockApiClient = {} as jest.Mocked<FireflyClientWithCerts>;
        mockExcludedTransactionService = {} as jest.Mocked<ExcludedTransactionService>;
        mockTransactionService = new TransactionService(
            mockApiClient
        ) as jest.Mocked<TransactionService>;
        mockTransactionClassificationService = new TransactionClassificationService(
            mockExcludedTransactionService
        ) as jest.Mocked<TransactionClassificationService>;
        service = new PaycheckSurplusService(
            mockTransactionService,
            mockTransactionClassificationService
        );
    });

    describe('calculatePaycheckSurplus', () => {
        const mockPaycheck = (amount: string): TransactionSplit =>
            ({
                amount,
                category_name: 'Paycheck',
                source_type: 'Revenue account',
            }) as TransactionSplit;

        it('should calculate surplus when actual paychecks exceed expected amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00'), mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(1000.0);
            expect(logger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    month: 1,
                    year: 2024,
                    expectedPaycheckAmount: 5000.0,
                    totalPaycheckAmount: 6000.0,
                    surplus: 1000.0,
                    paycheckCount: 2,
                }),
                'Calculated paycheck surplus'
            );
        });

        it('should calculate deficit when actual paychecks are less than expected amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('2000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(-3000.0);
        });

        it('should handle no paychecks found', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockResolvedValue([]);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(-5000.0);
        });

        it('should handle missing expected paycheck amount configuration', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Mock logger and config modules
            const mockLogger = {
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                trace: jest.fn(),
            };

            jest.unmock('../../src/logger');
            jest.mock('../../src/logger', () => ({
                logger: mockLogger,
            }));

            jest.unmock('../../src/config');
            jest.mock('../../src/config', () => ({
                expectedMonthlyPaycheck: undefined,
            }));

            // Clear module cache to ensure new mocks are used
            jest.resetModules();

            // Import service with mocked modules
            const { PaycheckSurplusService } = await import(
                '../../src/services/paycheck-surplus.service'
            );
            const testService = new PaycheckSurplusService(
                mockTransactionService,
                mockTransactionClassificationService
            );

            // Act
            const result = await testService.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(3000.0);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                { expectedMonthlyPaycheck: undefined },
                'Expected monthly paycheck amount not configured'
            );
        });

        it('should handle invalid expected paycheck amount', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Mock logger and config modules
            const mockLogger = {
                debug: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
                trace: jest.fn(),
            };

            jest.unmock('../../src/logger');
            jest.mock('../../src/logger', () => ({
                logger: mockLogger,
            }));

            jest.unmock('../../src/config');
            jest.mock('../../src/config', () => ({
                expectedMonthlyPaycheck: 'invalid',
            }));

            // Clear module cache to ensure new mocks are used
            jest.resetModules();

            // Import service with mocked modules
            const { PaycheckSurplusService } = await import(
                '../../src/services/paycheck-surplus.service'
            );
            const testService = new PaycheckSurplusService(
                mockTransactionService,
                mockTransactionClassificationService
            );

            // Act
            const result = await testService.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(3000.0);
            expect(mockLogger.error).toHaveBeenCalledWith(
                { expectedMonthlyPaycheck: 'invalid' },
                'Invalid expected monthly paycheck amount'
            );
        });

        it('should handle invalid paycheck amounts', async () => {
            // Arrange
            const paychecks = [mockPaycheck('3000.00'), mockPaycheck('invalid')];
            mockTransactionService.getTransactionsForMonth.mockResolvedValue(paychecks);
            mockTransactionClassificationService.isDeposit.mockReturnValue(true);

            // Act
            const result = await service.calculatePaycheckSurplus(1, 2024);

            // Assert
            expect(result).toBe(-2000.0);
            expect(logger.warn).toHaveBeenCalledWith(
                {
                    paycheck: {
                        amount: 'invalid',
                        category_name: 'Paycheck',
                        source_type: 'Revenue account',
                    },
                },
                'Invalid paycheck amount found'
            );
        });

        it('should handle API errors', async () => {
            // Arrange
            mockTransactionService.getTransactionsForMonth.mockRejectedValue(
                new Error('API Error')
            );

            // Act & Assert
            await expect(service.calculatePaycheckSurplus(1, 2024)).rejects.toThrow(
                'Failed to find paychecks for month 1'
            );
            expect(logger.error).toHaveBeenCalledWith(
                {
                    error: 'API Error',
                    type: 'Error',
                    month: 1,
                    year: 2024,
                },
                'Failed to find paychecks'
            );
        });

        it('should handle invalid month/year', async () => {
            // Arrange
            (DateUtils.validateMonthYear as jest.Mock).mockImplementation(() => {
                throw new Error('Invalid month/year');
            });

            // Act & Assert
            await expect(service.calculatePaycheckSurplus(13, 2024)).rejects.toThrow(
                'Failed to find paychecks for month 13'
            );
        });
    });

    describe('isPaycheck', () => {
        it('should identify valid paycheck transactions', () => {
            const transaction = {
                category_name: 'Paycheck',
                source_type: 'Revenue account',
            } as TransactionSplit;

            const result = (
                service as unknown as {
                    isPaycheck: (t: TransactionSplit) => boolean;
                }
            ).isPaycheck(transaction);
            expect(result).toBe(true);
        });

        it('should reject transactions with wrong category', () => {
            const transaction = {
                category_name: 'Salary',
                source_type: 'Revenue account',
            } as TransactionSplit;

            const result = (
                service as unknown as {
                    isPaycheck: (t: TransactionSplit) => boolean;
                }
            ).isPaycheck(transaction);
            expect(result).toBe(false);
        });

        it('should reject transactions with wrong source type', () => {
            const transaction = {
                category_name: 'Paycheck',
                source_type: 'Asset account',
            } as TransactionSplit;

            const result = (
                service as unknown as {
                    isPaycheck: (t: TransactionSplit) => boolean;
                }
            ).isPaycheck(transaction);
            expect(result).toBe(false);
        });
    });
});
