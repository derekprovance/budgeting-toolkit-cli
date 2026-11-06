import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

export interface LLMTransactionData {
    description: string;
    amount: string;
    date: string;
    source_account: string | null | undefined;
    destination_account: string | null | undefined;
    type: string;
    notes?: string | null | undefined;
}

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
