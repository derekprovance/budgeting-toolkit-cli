import { jest } from '@jest/globals';
import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { CashFlowService } from '../../src/services/cash-flow.service.js';
import { TransactionClassificationService } from '../../src/services/core/transaction-classification.service.js';
import { ITransactionService } from '../../src/services/core/transaction.service.interface.js';
import { createMockAccountScopeService, createMockLogger } from '../setup/mock-services.js';
import { deposit, transfer, withdrawal } from '../shared/test-data.js';

const CHK = '1';
const CC = '2';
const SAV = '3';

describe('CashFlowService', () => {
    const build = (transactions: TransactionSplit[]) => {
        const transactionService = {
            getTransactionsForMonth: jest
                .fn<(month: number, year: number) => Promise<TransactionSplit[]>>()
                .mockResolvedValue(transactions),
        } as unknown as ITransactionService;

        return new CashFlowService(
            transactionService,
            new TransactionClassificationService('Disposable Income', 'Paycheck'),
            createMockAccountScopeService([CHK, CC], [CHK]),
            createMockLogger()
        );
    };

    it('[R-BUCKET-1] should put each transaction in the one bucket it is charged to', async () => {
        const paycheck = deposit(1000, { destination_id: CHK, tags: ['Paycheck'] });
        const freelance = deposit(300, { destination_id: CHK });
        const rent = withdrawal(900, { source_id: CHK, bill_id: '7' });
        const concert = withdrawal(60, { source_id: CC, tags: ['Disposable Income'] });
        const groceries = withdrawal(80, { source_id: CC, budget_id: '9' });
        const hardware = withdrawal(35, { source_id: CC });

        const result = await build([
            paycheck,
            freelance,
            rent,
            concert,
            groceries,
            hardware,
        ]).getBuckets(1, 2025);

        expect(result.ok && result.value).toEqual({
            paycheck: [paycheck],
            additionalIncome: [freelance],
            bill: [rent],
            disposable: [concert],
            budget: [groceries],
            unbudgeted: [hardware],
        });
    });

    it('[R-SCOPE-2] [R-XFER-1] should drop what no bucket claims', async () => {
        const cardPayment = transfer(1200, { source_id: CHK, destination_id: CC });
        const savingsHalf = deposit(1500, { destination_id: SAV, tags: ['Paycheck'] });
        const taxFromSavings = withdrawal(250, { source_id: SAV, budget_id: '9' });

        const result = await build([cardPayment, savingsHalf, taxFromSavings]).getBuckets(1, 2025);

        expect(result.ok && Object.values(result.value).flat()).toEqual([]);
    });

    it('should report an invalid month as an error rather than empty buckets', async () => {
        const result = await build([]).getBuckets(13, 2025);

        expect(result.ok).toBe(false);
    });
});
