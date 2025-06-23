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
      description: "Assign the closest matching budget to each transaction from the provided list. Always select the most appropriate budget for each transaction, even if the match is not perfect. Return budgets in the same order as the input transactions.",
      parameters: {
        type: "object",
        properties: {
          budgets: {
            type: "array",
            items: {
              type: "string",
              enum: validBudgets
            },
            description: "Array of budgets to assign to transactions. Must be exactly one budget per transaction in the same order as input transactions. Do not return empty strings."
          }
        },
        required: ["budgets"]
      }
    };
  }

  async assignBudgets(
    transactions: TransactionSplit[],
    validBudgets: string[]
  ): Promise<string[]> {
    logger.debug(
      {
        transactionCount: transactions.length,
        budgetCount: validBudgets.length,
      },
      "Starting budget assignment"
    );

    if (!validBudgets.length) {
      logger.debug("No budgets provided, returning empty strings");
      return new Array(transactions.length).fill("");
    }

    const BATCH_SIZE = 10;
    const results: string[] = [];
    
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const batchResults = await this.assignBudgetsBatch(batch, validBudgets);
      results.push(...batchResults);
    }

    return results;
  }

  private async assignBudgetsBatch(
    transactions: TransactionSplit[],
    validBudgets: string[]
  ): Promise<string[]> {
    const budgetFunction = this.getBudgetFunction(validBudgets);
    
    const transactionData = transactions.map(tx => ({
      description: tx.description,
      amount: tx.amount,
      date: tx.date,
      source_account: tx.source_name,
      destination_account: tx.destination_name,
      type: tx.type,
      notes: tx.notes
    }));

    const message = {
      role: "user" as const,
      content: `Assign budgets to these transactions using the provided budget list. Match based on description, amount, and merchant type. Return budgets in same order.

Transactions:
${JSON.stringify(transactionData, null, 2)}

Return exactly ${transactions.length} budgets.`,
    };

    try {
      const response = await this.retryWithBackoff(async () => {
        logger.debug(
          {
            batchSize: transactions.length,
            transactionIds: transactions.map(tx => tx.transaction_journal_id)
          },
          "Sending batch request to Claude"
        );

        const result = await this.claudeClient.chat(
          [message],
          {
            functions: [budgetFunction],
            function_call: { name: "assign_budgets" }
          }
        );

        if (!result) {
          throw new Error("Invalid response from Claude");
        }

        try {
          const parsedResult = JSON.parse(result);
          const resultBudgets = parsedResult.budgets;
          
          if (!Array.isArray(resultBudgets) || resultBudgets.length !== transactions.length) {
            throw new Error(`Expected ${transactions.length} budgets, got ${resultBudgets?.length || 0}`);
          }

          for (const budget of resultBudgets) {
            if (!validBudgets.includes(budget)) {
              throw new Error(`Invalid budget: ${budget}`);
            }
          }

          return resultBudgets;
        } catch (error) {
          logger.error({
            batchSize: transactions.length,
            attemptedBudgets: result,
            validBudgets,
            error: error instanceof Error ? error.message : String(error)
          }, "Budget batch validation failed");
          return new Array(transactions.length).fill("");
        }
      });

      return response;
    } catch (error) {
      logger.error(
        {
          batchSize: transactions.length,
          transactionIds: transactions.map(tx => tx.transaction_journal_id),
          error: error instanceof Error ? error.message : String(error)
        },
        "Failed to assign budget batch"
      );
      return new Array(transactions.length).fill("");
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
        "Retrying operation after error"
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, retries - 1, delay * 2);
    }
  }
}
