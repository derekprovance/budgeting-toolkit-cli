import { createReadStream } from "fs";
import { access, constants } from "fs/promises";
import { parse } from "csv-parse";
import { ExcludedTransactionDto } from "../types/dto/excluded-transaction.dto";
import { join } from "path";
import { logger } from "../logger";

export class ExcludedTransactionService {
  private readonly excludedTransactionsPath: string;

  constructor() {
    this.excludedTransactionsPath = join(process.cwd(), "excluded_transactions.csv");
  }

  async getExcludedTransactions(): Promise<ExcludedTransactionDto[]> {
    try {
      await access(this.excludedTransactionsPath, constants.F_OK);
    } catch {
      logger.debug("No excluded transactions file found, returning empty array");
      return [];
    }

    const parser = parse({
      columns: ['description', 'amount'],
      skip_empty_lines: true,
      trim: true,
    });

    const records: ExcludedTransactionDto[] = [];
    const stream = createReadStream(this.excludedTransactionsPath);

    try {
      for await (const record of stream.pipe(parser)) {
        if (this.isValidExcludedTransaction(record)) {
          records.push({
            description: record.description,
            amount: this.convertCurrencyToFloat(record.amount),
            reason: 'Excluded from processing'
          });
        } else {
          logger.warn(`Invalid excluded transaction record: ${JSON.stringify(record)}`);
        }
      }
    } catch (error) {
      logger.error("Error parsing excluded transactions file:", error);
      throw new Error("Failed to parse excluded transactions file");
    }

    logger.trace({ records },"Excluded transactions parsed successfully");
    return records;
  }

  async isExcludedTransaction(description: string, amount: string): Promise<boolean> {
    const excludedTransactions = await this.getExcludedTransactions();
    const convertedAmount = this.convertCurrencyToFloat(amount);

    return excludedTransactions.some((transaction) => {
      if (!transaction.description && !transaction.amount) {
        return false;
      }

      if (transaction.description && transaction.amount) {
        return (
          transaction.description === description &&
          Math.abs(parseFloat(transaction.amount)) === Math.abs(parseFloat(convertedAmount))
        );
      }

      if (transaction.description) {
        return transaction.description === description;
      }

      if (transaction.amount) {
        return Math.abs(parseFloat(transaction.amount)) === Math.abs(parseFloat(convertedAmount));
      }

      return false;
    });
  }

  private isValidExcludedTransaction(record: unknown): record is { description: string; amount: string } {
    if (!record || typeof record !== 'object') {
      return false;
    }

    const dto = record as { description: string; amount: string };
    return (
      typeof dto.description === 'string' &&
      typeof dto.amount === 'string' &&
      dto.description.trim() !== '' &&
      dto.amount.trim() !== ''
    );
  }

  private convertCurrencyToFloat(amount: string): string {
    if (!amount) {
      throw new Error("Amount cannot be empty");
    }

    const isNegative = amount.includes("(") && amount.includes(")");

    const cleanAmount = amount
      .replace(/[()]/g, "")
      .replace(/[$€£¥]/g, "")
      .replace(/,/g, "")
      .trim();

    if (!/^-?\d*\.?\d+$/.test(cleanAmount)) {
      throw new Error(`Invalid amount format: ${amount}`);
    }

    const parsedAmount = parseFloat(cleanAmount);
    const finalAmount = isNegative ? -Math.abs(parsedAmount) : parsedAmount;

    return (Math.round(finalAmount * 100) / 100).toFixed(2);
  }
} 