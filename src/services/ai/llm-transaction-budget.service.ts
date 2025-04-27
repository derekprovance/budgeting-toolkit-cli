import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ChatMessage, ClaudeClient } from "../../api/claude.client";
import { logger } from "../../logger";
import { LLMResponseValidator } from "../ai/llm-response-validator.service";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class LLMTransactionBudgetService {
  constructor(private claudeClient: ClaudeClient) {}

  async assignBudgets(
    budgets: string[],
    transactions: TransactionSplit[],
    categories: string[]
  ): Promise<string[]> {
    logger.trace(
      {
        transactionCount: transactions.length,
        categoryCount: categories.length,
        budgets,
        transactionDetails: transactions.map((tx, idx) => ({
          id: tx.transaction_journal_id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          category: categories[idx],
        })),
      },
      "Starting budget assignment"
    );

    // Handle empty transactions
    if (!transactions.length) {
      logger.trace("No transactions to process");
      return [];
    }

    // Handle mismatched lengths
    if (transactions.length !== categories.length) {
      logger.warn(
        {
          transactionCount: transactions.length,
          categoryCount: categories.length,
          transactions: transactions.map((tx) => ({
            id: tx.transaction_journal_id,
            description: tx.description,
          })),
        },
        "Mismatched transaction and category counts"
      );
      throw new Error("Number of transactions and categories must match");
    }

    // Handle empty budgets
    if (!budgets.length) {
      logger.trace("No budgets provided, returning empty strings");
      return new Array(transactions.length).fill("");
    }

    const systemPrompt = this.buildBudgetPrompt(budgets);
    const messageBatches = this.prepareTransactionBatches(
      transactions,
      categories
    );

    logger.trace(
      {
        batchCount: messageBatches.length,
        systemPrompt,
        messages: messageBatches.map((batch) => batch[0].content),
      },
      "Prepared message batches"
    );

    try {
      const responses = await this.retryWithBackoff(async () => {
        logger.trace("Sending batch request to Claude");
        const rawResponses = await this.claudeClient.chatBatch(messageBatches, {
          systemPrompt,
        });

        logger.trace(
          {
            rawResponses,
            transactionDetails: transactions.map((tx, idx) => ({
              id: tx.transaction_journal_id,
              description: tx.description,
              category: categories[idx],
              proposedBudget: rawResponses[idx],
            })),
          },
          "Received raw responses from Claude"
        );

        // Clean responses before validation
        const cleanedResponses = rawResponses.map((response) =>
          this.cleanResponse(response)
        );
        logger.trace(
          {
            cleanedResponses,
            transactionDetails: transactions.map((tx, idx) => ({
              id: tx.transaction_journal_id,
              description: tx.description,
              category: categories[idx],
              proposedBudget: cleanedResponses[idx],
            })),
          },
          "Cleaned responses"
        );

        const validatedResponses = LLMResponseValidator.validateBatchResponses(
          cleanedResponses,
          (response) =>
            LLMResponseValidator.validateBudgetResponse(response, budgets)
        );

        logger.trace(
          {
            validatedResponses,
            transactionDetails: transactions.map((tx, idx) => ({
              id: tx.transaction_journal_id,
              description: tx.description,
              category: categories[idx],
              finalBudget: validatedResponses[idx],
            })),
          },
          "Validated responses"
        );

        return validatedResponses;
      });

      return responses;
    } catch (error) {
      if (error instanceof Error) {
        logger.error(
          {
            error: error.message,
            type: error.constructor.name,
            stack: error.stack,
            transactions: transactions.map((tx, idx) => ({
              id: tx.transaction_journal_id,
              description: tx.description,
              category: categories[idx],
            })),
          },
          "Error assigning budgets"
        );
      } else {
        logger.error(
          {
            error,
            transactions: transactions.map((tx, idx) => ({
              id: tx.transaction_journal_id,
              description: tx.description,
              category: categories[idx],
            })),
          },
          "Unknown error assigning budgets"
        );
      }
      throw error;
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

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.warn(
        {
          error: errorMessage,
          retries,
        },
        `Retrying operation after error: ${errorMessage}. ${retries} attempts remaining.`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }

  private buildBudgetPrompt(budgets: string[]): string {
    return `You are a budget assignment assistant. Your task is to analyze transactions and assign each to exactly ONE budget category from this list:
      ${budgets.map((budget) => `- ${budget}`).join("\n")}
      
      CRITICAL: You must ALWAYS respond with ONLY the exact budget name from the list above OR an empty string.
      
      Rules:
      1. Choose ONE budget from the provided list that best matches the transaction
      2. Consider the following factors:
         - Transaction category (if provided)
         - Transaction amount and currency
         - Full merchant name and description
         - Transaction date
         - Historical patterns (if available)
      3. For recurring transactions, maintain consistency with previous budget assignments
      4. If the transaction doesn't clearly fit any budget category, return an empty string
      5. Never include explanations, punctuation, or additional text
      6. DO NOT explain your choice or add any other text
      7. CRITICAL: Your response must be EXACTLY one of the budget names listed above or an empty string
      8. DO NOT include transaction descriptions or any other text in your response
      9. DO NOT return multiple budgets - choose the BEST ONE only
      10. DO NOT separate your response with newlines

      Examples:
      Input: "Transaction: Walmart groceries
        Amount: $50.00
        Date: 2024-01-01
        Category: Groceries
        Merchant: Walmart"
      Output: Groceries
      
      Input: "Transaction: ATM withdrawal
        Amount: $100.00
        Date: 2024-01-02
        Category: Cash
        Merchant: ATM"
      Output: 
      
      Input: "Transaction: Netflix subscription
        Amount: $15.99
        Date: 2024-01-03
        Category: Entertainment
        Merchant: Netflix"
      Output: Entertainment & Recreation
      
      Input: "Transaction 1:
        Description: Amazon Prime
        Amount: $119.00
        Date: 2024-01-04
        Category: Subscriptions
        Merchant: Amazon"
      Output: Entertainment & Recreation
      
      Input: "Transaction 1:
        Description: Gas station
        Amount: $45.00
        Date: 2024-01-05
        Category: Transportation
        Merchant: Shell
      Transaction 2:
        Description: Restaurant
        Amount: $75.00
        Date: 2024-01-05
        Category: Dining
        Merchant: Restaurant"
      Output: Transportation

      Remember: ONLY respond with a SINGLE budget name from the list or an empty string. No other text allowed.`;
  }

  private prepareTransactionBatches(
    transactions: TransactionSplit[],
    categories: string[]
  ): ChatMessage[][] {
    logger.trace(
      {
        transactionCount: transactions.length,
        categoryCount: categories.length,
        transactionDetails: transactions.map((tx, idx) => ({
          id: tx.transaction_journal_id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          category: categories[idx],
        })),
      },
      "Preparing transaction batches"
    );

    // Use consistent format for all transactions
    const content = transactions
      .map((tx, index) => {
        const merchant = this.extractMerchantName(tx.description);
        const amount = this.formatAmount(tx.amount, tx.currency_code);
        const date = this.formatDate(tx.date);

        return `Transaction ${transactions.length > 1 ? index + 1 + ":" : ""}
        Description: ${tx.description || "Unknown"}
        Merchant: ${merchant || "Unknown"}
        Amount: ${amount}
        Date: ${date}
        Category: ${categories[index] || "Uncategorized"}`;
      })
      .join("\n\n");

    const batch = [
      [
        {
          role: "user" as const,
          content,
        },
      ],
    ];

    logger.trace(
      {
        batchSize: transactions.length,
        content,
        transactionDetails: transactions.map((tx, idx) => ({
          id: tx.transaction_journal_id,
          description: tx.description,
          category: categories[idx],
        })),
      },
      "Created transaction batch"
    );

    return batch;
  }

  private extractMerchantName(description: string | null | undefined): string {
    if (!description) {
      logger.trace("No description provided for merchant extraction");
      return "Unknown";
    }

    // Remove common prefixes
    const cleanDesc = description.replace(/^(The|A|An)\s+/i, "");

    // Try to extract the merchant name - take first 3 words as they're usually part of the business name
    const merchantName = cleanDesc.split(/\s+/).slice(0, 3).join(" ");

    logger.trace(
      {
        original: description,
        cleaned: cleanDesc,
        extracted: merchantName,
      },
      "Extracted merchant name"
    );

    return merchantName;
  }

  private formatAmount(
    amount: string | null | undefined,
    currencyCode: string | null | undefined
  ): string {
    if (!amount) {
      logger.trace("No amount provided for formatting");
      return "Unknown Amount";
    }

    try {
      const numAmount = parseFloat(amount);
      const formatted = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currencyCode || "USD",
      }).format(numAmount);

      logger.trace(
        {
          original: amount,
          currency: currencyCode,
          formatted,
        },
        "Formatted amount"
      );

      return formatted;
    } catch (error) {
      logger.warn(
        {
          amount,
          currency: currencyCode,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to format amount"
      );
      return `${currencyCode || "$"}${amount}`;
    }
  }

  private formatDate(date: string | null | undefined): string {
    if (!date) {
      logger.trace("No date provided for formatting");
      return "Unknown Date";
    }

    try {
      const formatted = new Date(date).toISOString().split("T")[0];
      logger.trace(
        {
          original: date,
          formatted,
        },
        "Formatted date"
      );
      return formatted;
    } catch (error) {
      logger.warn(
        {
          date,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to format date"
      );
      return date;
    }
  }

  private cleanResponse(response: string): string {
    const original = response;
    // Remove any newlines and take only the first budget if multiple are returned
    const cleaned = response.split("\n")[0].trim();

    if (cleaned !== original) {
      logger.trace(
        {
          original,
          cleaned,
          hadNewlines: original.includes("\n"),
        },
        "Cleaned response"
      );
    }

    return cleaned;
  }
}
