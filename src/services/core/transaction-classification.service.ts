import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { Tag } from '../../config';
import { ExcludedTransactionService } from '../excluded-transaction.service';
import { loadYamlConfig } from '../../utils/config-loader';

export class TransactionClassificationService {
    private fireflyConfig;

    constructor(private readonly excludedTransactionService: ExcludedTransactionService) {
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
