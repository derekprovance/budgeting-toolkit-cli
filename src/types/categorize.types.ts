import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/** A split Firefly can key and update: the SDK types the journal id as optional */
export type JournaledTransaction = TransactionSplit & { transaction_journal_id: string };

export function hasJournalId(transaction: TransactionSplit): transaction is JournaledTransaction {
    return !!transaction.transaction_journal_id;
}
