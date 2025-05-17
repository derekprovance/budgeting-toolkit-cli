import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ClaudeClient } from "../../api/claude.client";
import { logger } from "../../logger";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class LLMTransactionCategoryService {
  constructor(private claudeClient: ClaudeClient) {}

  private getCategoryFunction(validCategories: string[]) {
    return {
      name: "assign_category",
      description: "Assign the closest matching category to a transaction from the provided list. Always select the most appropriate category, even if the match is not perfect. Do not return an empty string.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: validCategories,
            description: "The closest matching category to assign to the transaction. Must be exactly one of the provided categories. Do not return an empty string."
          }
        },
        required: ["category"]
      }
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
      "Starting transaction categorization"
    );

    if (!categories.length) {
      logger.debug("No categories provided, returning empty strings");
      return new Array(transactions.length).fill("");
    }

    const categoryFunction = this.getCategoryFunction(categories);
    const results: string[] = [];

    for (const tx of transactions) {
      try {
        const message = {
          role: "user" as const,
          content: `You are a financial transaction categorization expert. Your task is to assign the most appropriate category to each transaction from the provided list of valid categories. Always select the closest matching category, even if the match is not perfect. Do not return an empty string.

Consider these guidelines when categorizing:
1. Transaction amount can help determine the category (e.g., $3 at a gas station is likely a convenience store purchase, while $40 is likely fuel)
2. Look for keywords in the description that match category names
3. Consider the merchant type and typical spending patterns
4. If unsure, pick the most likely category based on the transaction context

Example categorizations:
- "STARBUCKS COFFEE $4.50" → "Coffee & Tea"
- "SHELL GAS STATION $3.25" → "General Supplies" (small amount suggests convenience store)
- "SHELL GAS STATION $45.00" → "Gasoline" (larger amount suggests fuel)
- "NETFLIX MONTHLY" → "Subscriptions & Streaming Services"
- "AMZN Mktp" → "General Supplies" (Amazon marketplace)

Here is the transaction data to analyze:
${JSON.stringify({
  description: tx.description,
  amount: tx.amount,
  date: tx.date,
  source_account: tx.source_name,
  destination_account: tx.destination_name,
  type: tx.type,
  notes: tx.notes
}, null, 2)}

This data will be used to determine the appropriate category. Consider the transaction description, amount, and type when making your decision.`,
        };

        const response = await this.retryWithBackoff(async () => {
          logger.debug(
            {
              transaction: {
                id: tx.transaction_journal_id,
                description: tx.description,
                amount: tx.amount,
                date: tx.date
              }
            },
            "Sending request to Claude"
          );

          const result = await this.claudeClient.chat(
            [message], 
            { 
              functions: [categoryFunction],
              function_call: { name: "assign_category" }
            }
          );

          if (!result) {
            throw new Error("Invalid response from Claude");
          }

          try {
            const parsedResult = JSON.parse(result);
            const category = parsedResult.category;
            
            if (!categories.includes(category)) {
              throw new Error("Invalid category");
            }

            return category;
          } catch (error) {
            logger.error({
              transaction: {
                id: tx.transaction_journal_id,
                description: tx.description,
                amount: tx.amount,
                date: tx.date
              },
              attemptedCategory: result,
              validCategories: categories,
              error: error instanceof Error ? error.message : String(error)
            }, "Category validation failed");
            return "";
          }
        });

        results.push(response);
      } catch (error) {
        logger.error(
          {
            transaction: {
              id: tx.transaction_journal_id,
              description: tx.description,
              amount: tx.amount,
              date: tx.date
            },
            error: error instanceof Error ? error.message : String(error)
          },
          "Failed to categorize transaction"
        );
        results.push("");
      }
    }

    return results;
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
        "Retrying operation after error"
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }
}
