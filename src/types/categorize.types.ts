import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/** A split Firefly can key and update: the SDK types the journal id as optional */
export type JournaledTransaction = TransactionSplit & { transaction_journal_id: string };

export function hasJournalId(transaction: TransactionSplit): transaction is JournaledTransaction {
    return !!transaction.transaction_journal_id;
}

/** The `categorize` flags, fixed for the whole run */
export interface CategorizeOptions {
    /** Re-suggest for transactions that already have a category and a budget */
    readonly force: boolean;
    /** Show what would change without prompting or updating */
    readonly dryRun: boolean;
}

export type SuggestionSource = 'history' | 'ai';

/** Names suggested for one transaction, and where each came from */
export interface Suggestion {
    category?: string;
    budget?: string;
    source?: { category?: SuggestionSource; budget?: SuggestionSource };
}
