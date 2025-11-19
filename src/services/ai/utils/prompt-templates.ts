import { LLMTransactionData } from './transaction-mapper';

export type AssignmentType = 'category' | 'budget';

/**
 * Generates the function schema for Claude's function calling API
 */
export function getFunctionSchema(type: AssignmentType, validOptions: string[]) {
    const fieldName = `${type === 'category' ? 'categories' : 'budgets'}`;
    const functionName = `assign_${fieldName}`;

    return {
        name: functionName,
        description: `Assign the closest matching ${type} from the available options to each transaction in the exact order provided. Return "${type === 'category' ? '(no category)' : '(no budget)'}" if no ${type} fits.`,
        parameters: {
            type: 'object' as const,
            properties: {
                [fieldName]: {
                    type: 'array' as const,
                    items: {
                        type: 'string' as const,
                        enum: validOptions,
                    },
                    description: `Array of ${fieldName} corresponding to each transaction in order`,
                },
            },
            required: [fieldName],
        },
    };
}

/**
 * Generates the system prompt for the assignment task
 */
export function getSystemPrompt(type: AssignmentType): string {
    return `You are a financial transaction ${type} assignment assistant. Analyze transactions and assign the most appropriate ${type} from the provided list. Be consistent and precise.`;
}

/**
 * Generates the user prompt with transaction data and valid options
 */
export function getUserPrompt(
    type: AssignmentType,
    transactions: LLMTransactionData[],
    validOptions: string[]
): string {
    const fieldName = type === 'category' ? 'categories' : 'budgets';
    const noMatchValue = type === 'category' ? '(no category)' : '(no budget)';

    const transactionList = transactions
        .map(
            (tx, i) =>
                `${i + 1}. ${tx.description} - $${tx.amount} - ${tx.date} (${tx.source_account} → ${tx.destination_account})`
        )
        .join('\n');

    const optionsList = validOptions.map(opt => `- ${opt}`).join('\n');

    return `Assign the most appropriate ${type} to each transaction below.

Available ${fieldName}:
${optionsList}

Transactions to ${type === 'category' ? 'categorize' : 'budget'}:
${transactionList}

Return the ${fieldName} in the exact same order as the transactions listed above. If no ${type} is appropriate, use "${noMatchValue}".`;
}

/**
 * Parses and validates the LLM response
 */
export function parseAssignmentResponse(
    type: AssignmentType,
    responseText: string,
    expectedCount: number,
    validOptions: string[]
): string[] {
    const fieldName = type === 'category' ? 'categories' : 'budgets';

    try {
        const parsed = JSON.parse(responseText);
        const results = parsed[fieldName];

        if (!Array.isArray(results)) {
            throw new Error(`Response does not contain a ${fieldName} array`);
        }

        if (results.length !== expectedCount) {
            throw new Error(`Expected ${expectedCount} ${fieldName}, got ${results.length}`);
        }

        // Validate each result is in the valid options
        for (const result of results) {
            if (!validOptions.includes(result)) {
                throw new Error(`Invalid ${type}: ${result}`);
            }
        }

        return results;
    } catch (error) {
        throw new Error(
            `Failed to parse ${type} assignment response: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
