import { createReadStream } from "fs";
import { access, constants } from "fs/promises";
import { parse } from "csv-parse";
import { ExcludedTransaction } from "../dto/excluded-transaction";
import { join } from "path";
import { logger } from "../logger";

interface CsvRecord {
  description?: unknown;
  amount?: unknown;
}
export class ExcludedTransactionService {
  private static readonly csvPath = join(
    process.cwd(),
    "excluded_transactions.csv"
  );

  private constructor() {}

  static async getTransactions(): Promise<ExcludedTransaction[]> {
    try {
      await access(this.csvPath, constants.F_OK);
    } catch (ex) {
      logger.trace(ex, "No excluded_transactions.csv detected.");
      return [];
    }

    return await this.parseExcludedTransactionCSV();
  }

  private static async parseExcludedTransactionCSV(): Promise<ExcludedTransaction[]> {
    const records: ExcludedTransaction[] = [];

    try {
      const parser = createReadStream(this.csvPath).pipe(
        parse({
          columns: ['description', 'amount'],
          skip_empty_lines: true,
          trim: true,
          delimiter: ",",
          cast: false,
        })
      );

      for await (const record of parser) {
        if (this.isValidRecord(record)) {
          records.push({
            description: record?.description?.trim(),
            amount: record.amount,
          });
        } else {
          logger.warn({
            record,
            reason: typeof record.amount === 'number' ? 'Invalid description' : 'Invalid amount'
          }, 'Invalid record found in CSV');
        }
      }

      return records;
    } catch (error) {
      logger.error({ error }, "Failed to read excluded transactions");
      throw error;
    }
  }

  private static isValidRecord(record: CsvRecord): record is ExcludedTransaction {
    if (!record.description || typeof record.description !== 'string' || !record.description.trim()) {
      record.description = undefined;
    } else {
      record.description = record.description.trim();
    }

    if (!record.amount) {
      record.amount = undefined;
      return true;
    }

    const amount = Number(record.amount);
    if (isNaN(amount)) {
      return false;
    }

    record.amount = amount.toFixed(2);
    return true;
  }
}
