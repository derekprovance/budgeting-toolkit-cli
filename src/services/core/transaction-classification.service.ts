import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { Tag } from '../../config.js';
import { IExcludedTransactionService } from '../excluded-transaction.service.interface.js';
import { loadYamlConfig } from '../../utils/config-loader.js';
import { ITransactionClassificationService } from './transaction-classification.service.interface.js';

export class TransactionClassificationService implements ITransactionClassificationService {
    private fireflyConfig;

    constructor(private readonly excludedTransactionService: IExcludedTransactionService) {
        const yamlConfig = loadYamlConfig();
        this.fireflyConfig = yamlConfig.firefly;
    }

    isTransfer(transaction: TransactionSplit): boolean {
        return transaction.type === 'transfer';
    }

    isBill(transaction: TransactionSplit): boolean {
        return transaction.tags ? transaction.tags?.includes(Tag.BILLS) : false;
    }

    isDisposableIncome(transaction: TransactionSplit): boolean {
        if (!transaction.tags) {
            return false;
        }

        return transaction.tags.includes(Tag.DISPOSABLE_INCOME);
    }

    hasNoDestination(destinationId: string | null): boolean {
        return destinationId === (this.fireflyConfig?.noNameExpenseAccountId || '5');
    }

    isSupplementedByDisposable(tags: string[] | null | undefined): boolean {
        return tags?.includes(Tag.DISPOSABLE_INCOME) ?? false;
    }

    async isExcludedTransaction(description: string, amount: string): Promise<boolean> {
        return this.excludedTransactionService.isExcludedTransaction(description, amount);
    }

    isDeposit(transaction: TransactionSplit): boolean {
        return transaction.type === 'deposit';
    }

    hasACategory(transaction: TransactionSplit): boolean {
        return !(transaction.category_id === undefined || transaction.category_id === null);
    }
}
