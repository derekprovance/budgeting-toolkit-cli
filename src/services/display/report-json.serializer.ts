import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { BillComparisonDto } from '../../types/dto/bill-comparison.dto.js';
import { BudgetReportJson, TransactionJson } from '../../types/dto/report-json.types.js';
import { CurrencyUtils } from '../../utils/currency.utils.js';
import { TransactionCalculationUtils } from '../../utils/transaction-calculation.utils.js';

/**
 * Serializes one transaction split for the JSON contract.
 *
 * The amount stays unsigned, exactly as Firefly returns it; direction is
 * `type`. `billId` falls back to `subscription_id`, matching how
 * TransactionClassificationService.isBill recognises a bill link.
 */
export function toTransactionJson(transaction: TransactionSplit): TransactionJson {
    return {
        journalId: transaction.transaction_journal_id ?? '',
        description: transaction.description,
        type: transaction.type,
        amount: CurrencyUtils.toCents(
            TransactionCalculationUtils.parseAmountSafe(transaction.amount)
        ),
        date: transaction.date,
        sourceId: transaction.source_id ?? null,
        destinationId: transaction.destination_id ?? null,
        budgetId: transaction.budget_id ?? null,
        billId: transaction.bill_id || transaction.subscription_id || null,
    };
}

/** The bill totals both report documents carry */
export function toBillTotalsJson(billComparison: BillComparisonDto): BudgetReportJson['bills'] {
    return {
        predicted: CurrencyUtils.toCents(billComparison.predictedTotal),
        actual: CurrencyUtils.toCents(billComparison.actualTotal),
        variance: CurrencyUtils.toCents(billComparison.variance),
    };
}
