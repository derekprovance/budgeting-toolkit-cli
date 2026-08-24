import '../setup/mock-logger.js'; // Must be first to mock logger module
import { resetMockLogger } from '../setup/mock-logger.js';
import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { AdditionalIncomeService } from '../../src/services/additional-income.service.js';
import { PaycheckSurplusService } from '../../src/services/paycheck-surplus.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { createMockAccountScopeService } from '../setup/mock-services.js';

const CHECKING = '1';
const SAVINGS = '2';

/**
 * A payroll deposit split across two accounts: the checking half is the
 * paycheck, the savings half is additional income. Both are income, so the two
 * buckets must partition it — every dollar counted exactly once, in exactly one
 * of them.
 *
 * These services are exercised together against the real classification service
 * on purpose. `isPaycheck` is what decides which bucket claims a transaction and
 * what the other bucket steps aside for; mocking it would test the mock, not the
 * precedence rule that keeps income from being double-counted or dropped.
 */
describe('split payroll bucketing', () => {
    const deposit = (amount: string, destination: string, tags: string[] = []): TransactionSplit =>
        ({
            amount,
            type: 'deposit',
            description: 'LOBDOTCOM INC PAYROLL',
            destination_id: destination,
            tags,
        }) as unknown as TransactionSplit;

    const buildServices = (transactions: TransactionSplit[], paycheckAccounts: string[]) => {
        const classification = new TransactionClassificationService(
            '5',
            'Disposable Income',
            'Paycheck',
            paycheckAccounts
        );

        const transactionService = {
            getTransactionsForMonth: jest
                .fn<(month: number, year: number) => Promise<TransactionSplit[]>>()
                .mockResolvedValue(transactions),
        } as unknown as ITransactionService;

        return {
            additionalIncome: new AdditionalIncomeService(
                transactionService,
                classification,
                createMockAccountScopeService([CHECKING, SAVINGS]),
                [],
                true
            ),
            paycheck: new PaycheckSurplusService(transactionService, classification, 0),
        };
    };

    const totals = async (transactions: TransactionSplit[], paycheckAccounts: string[]) => {
        const { additionalIncome, paycheck } = buildServices(transactions, paycheckAccounts);

        const incomeResult = await additionalIncome.calculateAdditionalIncome(7, 2026);
        const paycheckResult = await paycheck.calculatePaycheckSurplus(7, 2026);

        if (!incomeResult.ok || !paycheckResult.ok) {
            throw new Error('expected both analyses to succeed');
        }

        return {
            additionalIncome: incomeResult.value.reduce((sum, t) => sum + parseFloat(t.amount), 0),
            paycheck: paycheckResult.value.actual,
        };
    };

    it('should disregard a stray paycheck tag outside the configured accounts', async () => {
        // Both halves carry the tag, which is the July 2026 data problem.
        const transactions = [
            deposit('2582.31', CHECKING, ['Paycheck']),
            deposit('3229.76', SAVINGS, ['Paycheck']),
        ];

        const result = await totals(transactions, [CHECKING]);

        expect(result.paycheck).toBe(2582.31);
        expect(result.additionalIncome).toBe(3229.76);
    });

    it('should route the untagged savings half to additional income', async () => {
        // The correctly-tagged shape, as June and August 2026 have it.
        const transactions = [
            deposit('2582.31', CHECKING, ['Paycheck']),
            deposit('3229.77', SAVINGS),
        ];

        const result = await totals(transactions, [CHECKING]);

        expect(result.paycheck).toBe(2582.31);
        expect(result.additionalIncome).toBe(3229.77);
    });

    it('should conserve total income however the halves are tagged', async () => {
        // The invariant that makes the account constraint safe: rejecting a
        // transaction from the paycheck bucket must hand it to additional
        // income, never drop it from both.
        const bothTagged = [
            deposit('2582.31', CHECKING, ['Paycheck']),
            deposit('3229.76', SAVINGS, ['Paycheck']),
        ];
        const onlyCheckingTagged = [
            deposit('2582.31', CHECKING, ['Paycheck']),
            deposit('3229.76', SAVINGS),
        ];

        const tagged = await totals(bothTagged, [CHECKING]);
        const untagged = await totals(onlyCheckingTagged, [CHECKING]);

        expect(tagged.paycheck + tagged.additionalIncome).toBeCloseTo(5812.07, 2);
        expect(untagged.paycheck + untagged.additionalIncome).toBeCloseTo(5812.07, 2);
    });

    it('should count both halves as paycheck when no accounts are configured', async () => {
        // Backwards compatibility: an unconfigured list means the tag decides.
        const transactions = [
            deposit('2582.31', CHECKING, ['Paycheck']),
            deposit('3229.76', SAVINGS, ['Paycheck']),
        ];

        const result = await totals(transactions, []);

        expect(result.paycheck).toBeCloseTo(5812.07, 2);
        expect(result.additionalIncome).toBe(0);
    });

    beforeEach(() => {
        resetMockLogger();
    });
});
