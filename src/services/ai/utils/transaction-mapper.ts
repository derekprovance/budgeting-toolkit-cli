import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/**
 * Maps a TransactionSplit to the format expected by LLM services.
 * Extracts only the relevant fields needed for AI categorization and budgeting.
 */
export interface LLMTransactionData {
    description: string;
    amount: string;
    date: string;
    source_account: string | null | undefined;
    destination_account: string | null | undefined;
    type: string;
    notes?: string | null | undefined;
}

/**
 * Transforms a TransactionSplit into LLM-friendly format
 */
export function mapTransactionForLLM(tx: TransactionSplit): LLMTransactionData {
    return {
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
        source_account: tx.source_name,
        destination_account: tx.destination_name,
        type: tx.type,
        notes: tx.notes,
    };
}
