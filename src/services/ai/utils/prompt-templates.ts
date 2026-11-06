import Anthropic from '@anthropic-ai/sdk';
import { LLMTransactionData } from './transaction-mapper.js';
import { StringUtils } from '../../../utils/string.utils.js';

export type AssignmentType = 'category' | 'budget';

/**
 * The "no match" sentinel the LLM returns when no option fits.
 * Single source of truth — the schema, prompts, and response validation all
 * derive from this record, so callers never need to append it themselves.
 */
export const NO_MATCH_SENTINEL: Record<AssignmentType, string> = {
    category: '(no category)',
    budget: '(no budget)',
};

/**
 * Gets the no-match sentinel value for an assignment type
 */
export function getNoMatchValue(type: AssignmentType): string {
    return NO_MATCH_SENTINEL[type];
}

/**
 * Checks whether a value is the no-match sentinel (or empty), compared the way
 * the catalog compares names
 */
export function isNoMatch(type: AssignmentType, value: string | undefined): boolean {
    return (
        !value ||
        StringUtils.normalizeForMatching(value) ===
            StringUtils.normalizeForMatching(NO_MATCH_SENTINEL[type])
    );
}

/**
 * Returns the options list with the no-match sentinel appended (if absent)
 */
export function withSentinel(type: AssignmentType, validOptions: string[]): string[] {
    const sentinel = NO_MATCH_SENTINEL[type];
    return validOptions.includes(sentinel) ? validOptions : [...validOptions, sentinel];
}

/**
 * Generates the tool schema for Claude's tool-use API.
 * The sentinel is always included in the enum so the model can decline a match.
 */
export function getFunctionSchema(type: AssignmentType, validOptions: string[]): Anthropic.Tool {
    const fieldName = `${type === 'category' ? 'categories' : 'budgets'}`;
    const functionName = `assign_${fieldName}`;

    return {
        name: functionName,
        description: `Assign the closest matching ${type} from the available options to each transaction in the exact order provided. Return "${NO_MATCH_SENTINEL[type]}" if no ${type} fits.`,
        input_schema: {
            type: 'object',
            properties: {
                [fieldName]: {
                    type: 'array',
                    items: {
                        type: 'string',
                        enum: withSentinel(type, validOptions),
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
    const noMatchValue = NO_MATCH_SENTINEL[type];

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
 * Parses the forced tool call's input into one answer per transaction, in
 * order. Answers are returned as given: matching them to a category or budget
 * is the catalog's job.
 *
 * @throws Error when the payload is not JSON, lacks the array, has the wrong
 *   count or holds a non-string answer
 */
export function parseAssignmentResponse(
    type: AssignmentType,
    responseText: string,
    expectedCount: number
): string[] {
    const fieldName = type === 'category' ? 'categories' : 'budgets';

    let parsed: Record<string, unknown>;
    try {
        const rawParsed: unknown = JSON.parse(responseText);
        if (rawParsed === null || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
            throw new Error(
                `Expected a JSON object, got ${rawParsed === null ? 'null' : typeof rawParsed}`
            );
        }
        parsed = rawParsed as Record<string, unknown>;
    } catch (error) {
        throw new Error(
            `Failed to parse ${type} assignment response: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
        );
    }

    const results = parsed[fieldName];

    if (!Array.isArray(results)) {
        throw new Error(`Response does not contain a ${fieldName} array`);
    }

    if (results.length !== expectedCount) {
        throw new Error(`Expected ${expectedCount} ${fieldName}, got ${results.length}`);
    }

    const invalidIndex = results.findIndex(result => typeof result !== 'string');
    if (invalidIndex !== -1) {
        throw new Error(`Invalid ${type} at index ${invalidIndex}: not a string`);
    }

    return results as string[];
}
