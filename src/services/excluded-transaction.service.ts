import { createReadStream } from "fs";
import { access, constants } from "fs/promises";
import { parse } from "csv-parse";
import { ExcludedTransactionDto } from "../types/dto/excluded-transaction.dto";
import { join } from "path";
import { logger } from "../logger";

export class ExcludedTransactionService {
  private readonly excludedTransactionsPath: string;

  constructor() {
    this.excludedTransactionsPath = join(process.cwd(), "excluded-transactions.csv");
  }

  async getExcludedTransactions(): Promise<ExcludedTransactionDto[]> {
    try {
      await access(this.excludedTransactionsPath, constants.F_OK);
    } catch {
      logger.debug("No excluded transactions file found, returning empty array");
      return [];
    }

    const parser = parse({
      columns: true,
      skip_empty_lines: true,
    });

    const records: ExcludedTransactionDto[] = [];
    const stream = createReadStream(this.excludedTransactionsPath);

    try {
      for await (const record of stream.pipe(parser)) {
        if (this.isValidExcludedTransaction(record)) {
          records.push(record as ExcludedTransactionDto);
        } else {
          logger.warn(`Invalid excluded transaction record: ${JSON.stringify(record)}`);
        }
      }
    } catch (error) {
      logger.error("Error parsing excluded transactions file:", error);
      throw new Error("Failed to parse excluded transactions file");
    }

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
          transaction.amount === convertedAmount
        );
      }

      if (transaction.description) {
        return transaction.description === description;
      }

      if (transaction.amount) {
        return transaction.amount === convertedAmount;
      }

      return false;
    });
  }

  private isValidExcludedTransaction(record: unknown): record is ExcludedTransactionDto {
    if (!record || typeof record !== 'object') {
      return false;
    }

    const dto = record as ExcludedTransactionDto;
    return (
      typeof dto.description === 'string' &&
      typeof dto.reason === 'string' &&
      (dto.amount === undefined || typeof dto.amount === 'string')
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