import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ExpenseAccount, Tag } from "../../config";
import { ExcludedTransactionService } from "../excluded-transaction.service";

export class TransactionPropertyService {
    constructor(
        private readonly excludedTransactionService: ExcludedTransactionService,
    ) {}

    isTransfer(transaction: TransactionSplit): boolean {
        return transaction.type === "transfer";
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
        return destinationId === ExpenseAccount.NO_NAME;
    }

    isSupplementedByDisposable(tags: string[] | null | undefined): boolean {
        return tags?.includes(Tag.DISPOSABLE_INCOME) ?? false;
    }

    async isExcludedTransaction(
        description: string,
        amount: string,
    ): Promise<boolean> {
        return this.excludedTransactionService.isExcludedTransaction(
            description,
            amount,
        );
    }

    isDeposit(transaction: TransactionSplit): boolean {
        return transaction.type === "deposit";
    }

    hasACategory(transaction: TransactionSplit): boolean {
        return !(
            transaction.category_id === undefined ||
            transaction.category_id === null
        );
    }

    private convertCurrencyToFloat(amount: string): string {
        if (!amount) {
            throw new Error("Amount cannot be empty");
        }

        const isNegative = amount.includes("(") && amount.includes(")");

        const cleanAmount = amount
            .replace(/[()]/g, "")
            .replace(/[$€£¥]/g, "")
            .replace(/,/g, "")
            .trim();

        if (!/^-?\d*\.?\d+$/.test(cleanAmount)) {
            throw new Error(`Invalid amount format: ${amount}`);
        }

        const parsedAmount = parseFloat(cleanAmount);
        const finalAmount = isNegative ? -Math.abs(parsedAmount) : parsedAmount;

        return (Math.round(finalAmount * 100) / 100).toFixed(2);
    }
}
