import { TransactionSplit } from "@derekprovance/firefly-iii-sdk";
import { ChatMessage, ClaudeClient } from "../../api/claude.client";
import { logger } from "../../logger";
import { LLMResponseValidator } from "../ai/llm-response-validator.service";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class LLMTransactionCategoryService {
  constructor(private claudeClient: ClaudeClient) {}

  async categorizeTransactions(
    categories: string[],
    transactions: TransactionSplit[]
  ): Promise<string[]> {
    logger.trace(
      {
        transactionCount: transactions.length,
        categories,
        transactions: transactions.map((tx) => ({
          id: tx.transaction_journal_id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
        })),
      },
      "Starting category assignment"
    );

    // Handle empty transactions
    if (!transactions.length) {
      logger.trace("No transactions to process");
      return [];
    }

    // Handle empty categories
    if (!categories.length) {
      logger.trace("No categories provided, returning empty strings");
      return new Array(transactions.length).fill("");
    }

    const systemPrompt = this.buildCategoryPrompt(categories);
    const messageBatches = this.prepareTransactionBatches(transactions);

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

        if (!rawResponses) {
          throw new Error("Invalid response from Claude");
        }

        logger.trace(
          {
            rawResponses,
            transactionDetails: transactions.map((tx, idx) => ({
              id: tx.transaction_journal_id,
              description: tx.description,
              proposedCategory: rawResponses[idx],
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
              proposedCategory: cleanedResponses[idx],
            })),
          },
          "Cleaned responses"
        );

        let validatedResponses: string[];
        try {
          validatedResponses = LLMResponseValidator.validateBatchResponses(
            cleanedResponses,
            (response) =>
              LLMResponseValidator.validateCategoryResponse(
                response,
                categories
              )
          );

          logger.trace(
            {
              validatedResponses,
              transactionDetails: transactions.map((tx, idx) => ({
                id: tx.transaction_journal_id,
                description: tx.description,
                finalCategory: validatedResponses[idx],
              })),
            },
            "Validated responses"
          );

          return validatedResponses;
        } catch (error) {
          if (error instanceof Error && error.message === "Invalid category") {
            throw error;
          }
          throw new Error("Invalid response from Claude");
        }
      });

      return responses;
    } catch (error) {
      logger.error({ error }, "Error categorizing transactions");
      throw error;
    }
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    retries = MAX_RETRIES,
    delay = RETRY_DELAY_MS
  ): Promise<T> {
    try {
      const result = await operation();
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid category") {
        throw error;
      }

      if (retries === 0) {
        throw error;
      }

      logger.warn(
        `Retrying operation after error: ${
          error instanceof Error ? error.message : "Unknown error"
        }. ${retries} attempts remaining.`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }

  private buildCategoryPrompt(categories: string[]): string {
    return `You are a transaction categorization assistant. Your task is to analyze transactions and assign each to exactly ONE category from this list:
      ${categories.map((category) => `- ${category}`).join("\n")}
      
      CRITICAL: You must ALWAYS respond with ONLY the exact category name from the list above OR an empty string.
      
      Rules:
      1. Choose ONE category from the provided list that best matches the transaction
      2. Consider the following factors in order of importance:
         - Full merchant name and description
         - Recipient information (for payment platform transactions)
         - Transaction amount and currency
         - Transaction date
         - Historical patterns (if available)
      3. For recurring transactions, maintain consistency with previous category assignments
      4. Special rules for payment platforms (Venmo, PayPal, Cash App, Zelle):
         - Focus on the recipient and payment description, not just the platform name
         - Look for keywords in the recipient's name or description that hint at the purpose
         - For personal transfers or unclear purposes, use the most appropriate personal finance category
         - If the purpose is completely unclear, return an empty string
      5. Never include explanations, punctuation, or additional text
      6. DO NOT explain your choice or add any other text
      7. CRITICAL: Your response must be EXACTLY one of the category names listed above or an empty string
      8. DO NOT include transaction descriptions or any other text in your response
      9. DO NOT return multiple categories - choose the BEST ONE only
      10. DO NOT separate your response with newlines

      Examples:
      Input: "Transaction: Walmart groceries
        Amount: $50.00
        Date: 2024-01-01
        Merchant: Walmart"
      Output: Groceries
      
      Input: "Transaction: Venmo payment to John Smith for dinner
        Amount: $25.00
        Date: 2024-01-02
        Merchant: Venmo
        Recipient: John Smith"
      Output: Dining Out
      
      Input: "Transaction: PayPal transfer to Jane Doe
        Amount: $500.00
        Date: 2024-01-03
        Merchant: PayPal
        Recipient: Jane Doe"
      Output: Personal Transfers
      
      Input: "Transaction: Venmo charge from Bob's Plumbing
        Amount: $150.00
        Date: 2024-01-04
        Merchant: Venmo
        Recipient: Bob's Plumbing"
      Output: Home Maintenance
      
      Input: "Transaction: Cash App payment to @coffeeshop
        Amount: $4.50
        Date: 2024-01-05
        Merchant: Cash App
        Recipient: @coffeeshop"
      Output: Coffee Shops

      Remember: ONLY respond with a SINGLE category name from the list or an empty string. No other text allowed.`;
  }

  private prepareTransactionBatches(
    transactions: TransactionSplit[]
  ): ChatMessage[][] {
    logger.trace(
      {
        transactionCount: transactions.length,
        transactionDetails: transactions.map((tx) => ({
          id: tx.transaction_journal_id,
          description: tx.description,
          amount: tx.amount,
          date: tx.date,
          merchantInfo: this.extractMerchantInfo(tx.description),
        })),
      },
      "Preparing transaction batches"
    );

    // If it's a single transaction, process it individually
    if (transactions.length === 1) {
      const batch = [this.formatSingleTransaction(transactions[0])];
      const merchantInfo = this.extractMerchantInfo(
        transactions[0].description
      );
      logger.trace(
        {
          transactionId: transactions[0].transaction_journal_id,
          description: transactions[0].description,
          merchantInfo,
          content: batch[0][0].content,
        },
        "Created single transaction batch"
      );
      return batch;
    }

    // For multiple transactions, group them in a single message
    const transactionDetails = transactions.map((tx, index) => {
      const merchantInfo = this.extractMerchantInfo(tx.description);
      return {
        index,
        id: tx.transaction_journal_id,
        description: tx.description,
        amount: tx.amount,
        date: tx.date,
        merchantInfo,
      };
    });

    const content = transactionDetails
      .map(
        (detail, index) =>
          `Transaction ${index + 1}:
        Description: ${detail.description}
        Amount: $${detail.amount}
        Date: ${detail.date}
        Merchant: ${detail.merchantInfo.merchant}${
            detail.merchantInfo.recipient
              ? `\n        Recipient: ${detail.merchantInfo.recipient}`
              : ""
          }`
      )
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
        transactionDetails,
        content,
      },
      "Created multiple transaction batch"
    );

    return batch;
  }

  private formatSingleTransaction(tx: TransactionSplit): ChatMessage[] {
    const merchantInfo = this.extractMerchantInfo(tx.description);
    const content = `Transaction: ${tx.description}
        Amount: $${tx.amount}
        Date: ${tx.date}
        Merchant: ${merchantInfo.merchant}${
      merchantInfo.recipient
        ? `\n        Recipient: ${merchantInfo.recipient}`
        : ""
    }`;

    logger.trace(
      {
        transactionId: tx.transaction_journal_id,
        description: tx.description,
        merchantInfo,
        formattedContent: content,
      },
      "Formatting single transaction"
    );

    return [
      {
        role: "user" as const,
        content,
      },
    ];
  }

  private extractMerchantInfo(description: string | null | undefined): {
    merchant: string;
    recipient?: string;
  } {
    if (!description) {
      logger.trace(
        {
          description,
        },
        "Empty description in merchant info extraction"
      );
      return { merchant: "Unknown" };
    }

    const desc = description.trim();

    // Handle payment platforms
    const paymentPlatforms = {
      Venmo:
        /^(?:Venmo\s+(?:payment\s+(?:to|from)|charge\s+(?:to|from))\s+(.+)|(?:Payment\s+(?:to|from))\s+(.+)\s+on\s+Venmo)/i,
      PayPal:
        /^(?:PayPal\s+(?:payment\s+(?:to|from)|transfer\s+(?:to|from))\s+(.+)|(?:Payment\s+(?:to|from))\s+(.+)\s+via\s+PayPal)/i,
      "Cash App":
        /^(?:Cash\s*App\s+(?:payment|transfer)\s+(?:to|from)\s+(.+)|Square\s+Cash\s+(?:payment|transfer)\s+(?:to|from)\s+(.+))/i,
      Zelle:
        /^(?:Zelle\s+(?:payment|transfer)\s+(?:to|from)\s+(.+)|(?:Payment|Transfer)\s+(?:to|from)\s+(.+)\s+via\s+Zelle)/i,
    };

    for (const [platform, regex] of Object.entries(paymentPlatforms)) {
      const match = desc.match(regex);
      if (match) {
        const recipient = match[1] || match[2];
        const result = {
          merchant: platform,
          recipient: recipient?.trim(),
        };
        logger.trace(
          {
            description: desc,
            platform,
            recipient: result.recipient,
            regexMatch: match[0],
          },
          "Payment platform detected"
        );
        return result;
      }
    }

    // For other transactions, use the first meaningful word
    // Skip common prefixes like "POS", "ACH", etc.
    const skipPrefixes = [
      "pos",
      "ach",
      "debit",
      "credit",
      "payment",
      "purchase",
    ];
    const words = desc.split(/\s+/);
    const merchantWord =
      words.find(
        (word) => !skipPrefixes.includes(word.toLowerCase()) && word.length > 1
      ) || words[0];

    logger.trace(
      {
        description: desc,
        words,
        skippedPrefixes: words.filter((w) =>
          skipPrefixes.includes(w.toLowerCase())
        ),
        selectedMerchant: merchantWord,
      },
      "Standard merchant extraction"
    );

    return { merchant: merchantWord };
  }

  private cleanResponse(response: string): string {
    const original = response;
    // Remove any newlines and take only the first category if multiple are returned
    const cleaned = response.split("\n")[0].trim();

    if (cleaned !== original) {
      logger.trace("Cleaned response", {
        original,
        cleaned,
        hadNewlines: original.includes("\n"),
      });
    }

    return cleaned;
  }
}
