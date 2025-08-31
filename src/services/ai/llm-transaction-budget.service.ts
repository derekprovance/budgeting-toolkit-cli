import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ClaudeClient } from "../../api/claude.client";
import { logger } from "../../logger";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class LLMTransactionBudgetService {
    constructor(private readonly claudeClient: ClaudeClient) {}

    private getBudgetFunction(validBudgets: string[]) {
        return {
            name: "assign_budgets",
            description:
                "Assign the closest matching budget to each transaction from the provided list. Always select the most appropriate budget for each transaction, even if the match is not perfect. Return budgets in the same order as the input transactions.",
            parameters: {
                type: "object",
                properties: {
                    budgets: {
                        type: "array",
                        items: {
                            type: "string",
                            enum: validBudgets,
                        },
                        description:
                            "Array of budgets to assign to transactions. Must be exactly one budget per transaction in the same order as input transactions. Do not return empty strings.",
                    },
                },
                required: ["budgets"],
            },
        };
    }

    async assignBudgets(
        transactions: TransactionSplit[],
        validBudgets: string[],
    ): Promise<string[]> {
        logger.debug(
            {
                transactionCount: transactions.length,
                budgetCount: validBudgets.length,
            },
            "Starting budget assignment",
        );

        if (!validBudgets.length) {
            logger.debug("No budgets provided, returning empty strings");
            return new Array(transactions.length).fill("");
        }

        const BATCH_SIZE = 10;
        const results: string[] = [];

        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            const batch = transactions.slice(i, i + BATCH_SIZE);
            const batchResults = await this.assignBudgetsBatch(
                batch,
                validBudgets,
            );
            results.push(...batchResults);
        }

        return results;
    }

    private async assignBudgetsBatch(
        transactions: TransactionSplit[],
        validBudgets: string[],
    ): Promise<string[]> {
        const budgetFunction = this.getBudgetFunction(validBudgets);

        const transactionData = transactions.map((tx) => ({
            description: tx.description,
            amount: tx.amount,
            date: tx.date,
            source_account: tx.source_name,
            destination_account: tx.destination_name,
            type: tx.type,
            notes: tx.notes,
        }));

        const message = {
            role: "user" as const,
            content: `You are a financial categorization expert. Assign the most appropriate budget category to each transaction based on the merchant, description, and spending context.

BUDGET CATEGORIES AND THEIR PURPOSE:
${this.getBudgetCategoryGuide(validBudgets)}

ASSIGNMENT RULES:
1. For subscription services, consider the primary purpose:
   - Business/productivity tools → Business-related budget (often miscellaneous)
   - Entertainment/streaming services → Entertainment-related budget
   - News/education → General or miscellaneous budget

2. For food and dining, distinguish by type:
   - Grocery stores, supermarkets → Food/grocery budget
   - Restaurants, bars, cafes → Dining out budget
   - Quick service, coffee shops → Dining out budget

3. For transportation:
   - Gas, car maintenance, vehicle services → Transportation budget
   - Rideshare, parking, public transit → Transportation budget

4. For healthcare:
   - Medical bills, pharmacy, doctors → Medical/health budget

5. For unclear merchants:
   - Consider transaction amount and context
   - Look for keywords in merchant name
   - Match to the most appropriate available budget
   - Use general/miscellaneous budget as last resort

6. Always assign a budget from the available list - never leave empty

GENERAL EXAMPLES (adapt to your available budgets):
- Subscription services → Business budget OR Entertainment budget (based on purpose)
- Coffee shops → Dining out budget
- Grocery stores → Food/grocery budget  
- Gas stations → Transportation budget
- Breweries/bars → Dining out budget
- Government services → Transportation (if vehicle-related) OR appropriate category

Transactions to categorize:
${JSON.stringify(transactionData, null, 2)}

Return exactly ${transactions.length} budget categories from the available list.`,
        };

        try {
            const response = await this.retryWithBackoff(async () => {
                logger.debug(
                    {
                        batchSize: transactions.length,
                        transactionIds: transactions.map(
                            (tx) => tx.transaction_journal_id,
                        ),
                    },
                    "Sending batch request to Claude",
                );

                const result = await this.claudeClient.chat([message], {
                    functions: [budgetFunction],
                    function_call: { name: "assign_budgets" },
                });

                if (!result) {
                    throw new Error("Invalid response from Claude");
                }

                try {
                    const parsedResult = JSON.parse(result);
                    const resultBudgets = parsedResult.budgets;

                    if (
                        !Array.isArray(resultBudgets) ||
                        resultBudgets.length !== transactions.length
                    ) {
                        throw new Error(
                            `Expected ${transactions.length} budgets, got ${resultBudgets?.length || 0}`,
                        );
                    }

                    for (const budget of resultBudgets) {
                        if (!validBudgets.includes(budget)) {
                            throw new Error(`Invalid budget: ${budget}`);
                        }
                    }

                    return resultBudgets;
                } catch (error) {
                    logger.error(
                        {
                            batchSize: transactions.length,
                            attemptedBudgets: result,
                            validBudgets,
                            error:
                                error instanceof Error
                                    ? error.message
                                    : String(error),
                        },
                        "Budget batch validation failed",
                    );
                    return new Array(transactions.length).fill("");
                }
            });

            return response;
        } catch (error) {
            logger.error(
                {
                    batchSize: transactions.length,
                    transactionIds: transactions.map(
                        (tx) => tx.transaction_journal_id,
                    ),
                    error:
                        error instanceof Error ? error.message : String(error),
                },
                "Failed to assign budget batch",
            );
            return new Array(transactions.length).fill("");
        }
    }

    private async retryWithBackoff<T>(
        operation: () => Promise<T>,
        retries = MAX_RETRIES,
        delay = RETRY_DELAY_MS,
    ): Promise<T> {
        try {
            return await operation();
        } catch (error) {
            if (retries === 0) {
                throw error;
            }

            logger.warn(
                {
                    error:
                        error instanceof Error ? error.message : String(error),
                    retriesLeft: retries,
                    delay,
                },
                "Retrying operation after error",
            );

            await new Promise((resolve) => setTimeout(resolve, delay));
            return this.retryWithBackoff(operation, retries - 1, delay * 2);
        }
    }

    private getBudgetCategoryGuide(validBudgets: string[]): string {
        // Generate descriptions based on budget names using common patterns
        const generateDescription = (budgetName: string): string => {
            const name = budgetName.toLowerCase();

            // Pattern matching for common budget types
            if (name.includes("grocer") || name.includes("food")) {
                return "Food shopping, supermarkets, grocery stores";
            }
            if (
                name.includes("going out") ||
                name.includes("dining") ||
                name.includes("restaurant")
            ) {
                return "Restaurants, bars, cafes, dining out, social activities";
            }
            if (
                name.includes("entertainment") ||
                name.includes("recreation") ||
                name.includes("fun")
            ) {
                return "Movies, streaming services, games, sports, hobbies, recreational activities";
            }
            if (
                name.includes("transport") ||
                name.includes("car") ||
                name.includes("gas") ||
                name.includes("vehicle")
            ) {
                return "Gas, car maintenance, DMV services, rideshare, parking, public transit";
            }
            if (
                name.includes("medical") ||
                name.includes("health") ||
                name.includes("doctor")
            ) {
                return "Healthcare expenses, pharmacy, medical bills, insurance copays";
            }
            if (
                name.includes("donation") ||
                name.includes("charit") ||
                name.includes("giving")
            ) {
                return "Charitable giving, donations, non-profit contributions";
            }
            if (
                name.includes("misc") ||
                name.includes("other") ||
                name.includes("general")
            ) {
                return "General expenses, business tools, professional subscriptions, unclear transactions";
            }

            // Default description for unrecognized budget names
            return `Expenses related to ${budgetName.toLowerCase()} category`;
        };

        return validBudgets
            .map((budget) => `- ${budget}: ${generateDescription(budget)}`)
            .join("\n");
    }
}
