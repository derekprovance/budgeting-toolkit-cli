import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { ClaudeClient } from '../../api/claude.client';
import { logger } from '../../logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class LLMTransactionCategoryService {
    constructor(private claudeClient: ClaudeClient) {}

    private getCategoryFunction(validCategories: string[]) {
        return {
            name: 'assign_categories',
            description:
                'Assign the closest matching category to each transaction from the provided list. Always select the most appropriate category for each transaction, even if the match is not perfect. Return categories in the same order as the input transactions.',
            parameters: {
                type: 'object',
                properties: {
                    categories: {
                        type: 'array',
                        items: {
                            type: 'string',
                            enum: validCategories,
                        },
                        description:
                            'Array of categories to assign to transactions. Must be exactly one category per transaction in the same order as input transactions. Do not return empty strings.',
                    },
                },
                required: ['categories'],
            },
        };
    }

    async categorizeTransactions(
        transactions: TransactionSplit[],
        categories: string[]
    ): Promise<string[]> {
        logger.debug(
            {
                transactionCount: transactions.length,
                categoryCount: categories.length,
            },
            'Starting transaction categorization'
        );

        if (!categories.length) {
            logger.debug('No categories provided, returning empty strings');
            return new Array(transactions.length).fill('');
        }

        const BATCH_SIZE = 10;
        const results: string[] = [];

        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            const batch = transactions.slice(i, i + BATCH_SIZE);
            const batchResults = await this.categorizeBatch(batch, categories);
            results.push(...batchResults);
        }

        return results;
    }

    private async categorizeBatch(
        transactions: TransactionSplit[],
        categories: string[]
    ): Promise<string[]> {
        const categoryFunction = this.getCategoryFunction(categories);

        const transactionData = transactions.map(tx => ({
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            source_account: tx.source_name,
            destination_account: tx.destination_name,
            type: tx.type,
            notes: tx.notes,
        }));

        const message = {
            role: 'user' as const,
            content: `You are a financial transaction categorization expert. Assign the most appropriate category to each transaction based on merchant type, description, and context.

CATEGORIZATION RULES:
1. Match merchant names to their primary business type
2. Consider transaction amounts for context (small coffee vs large grocery)
3. Look for keywords in descriptions
4. Always assign a category from the provided list
5. Be consistent with similar merchants

COMMON PATTERNS:
- Breweries, bars, "TST*" merchants → Bars & Alcohol
- Coffee shops, cafes → Coffee & Tea  
- Subscription services → Subscriptions & Streaming Services
- AI/ML tools → Research & Development
- Government services, DMV → Vehicle Registration (if vehicle-related)
- Gas stations (large amounts) → Gasoline
- Gas stations (small amounts) → General Supplies

Transactions to categorize:
${JSON.stringify(transactionData, null, 2)}

Return exactly ${transactions.length} categories from the available list.`,
        };

        try {
            const response = await this.retryWithBackoff(async () => {
                logger.debug(
                    {
                        batchSize: transactions.length,
                        transactionIds: transactions.map(tx => tx.transaction_journal_id),
                    },
                    'Sending batch request to Claude'
                );

                const result = await this.claudeClient.chat([message], {
                    functions: [categoryFunction],
                    function_call: { name: 'assign_categories' },
                });

                if (!result) {
                    throw new Error('Invalid response from Claude');
                }

                try {
                    const parsedResult = JSON.parse(result);
                    const resultCategories = parsedResult.categories;

                    if (
                        !Array.isArray(resultCategories) ||
                        resultCategories.length !== transactions.length
                    ) {
                        throw new Error(
                            `Expected ${transactions.length} categories, got ${resultCategories?.length || 0}`
                        );
                    }

                    for (const category of resultCategories) {
                        if (!categories.includes(category)) {
                            throw new Error(`Invalid category: ${category}`);
                        }
                    }

                    return resultCategories;
                } catch (error) {
                    logger.error(
                        {
                            batchSize: transactions.length,
                            attemptedCategories: result,
                            validCategories: categories,
                            error: error instanceof Error ? error.message : String(error),
                        },
                        'Category batch validation failed'
                    );
                    return new Array(transactions.length).fill('');
                }
            });

            return response;
        } catch (error) {
            logger.error(
                {
                    batchSize: transactions.length,
                    transactionIds: transactions.map(tx => tx.transaction_journal_id),
                    error: error instanceof Error ? error.message : String(error),
                },
                'Failed to categorize transaction batch'
            );
            return new Array(transactions.length).fill('');
        }
    }

    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        retries = MAX_RETRIES,
        delay = RETRY_DELAY_MS
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retries === 0) {
                throw error;
            }

            logger.warn(
                {
                    error: error instanceof Error ? error.message : String(error),
                    retriesLeft: retries,
                    delay,
                },
                'Retrying operation after error'
            );

            await new Promise(resolve => setTimeout(resolve, delay));
            return this.retryWithBackoff(operation, retries - 1, delay * 2);
        }
    }
}
