import { createReadStream } from "fs";
import { access, constants } from "fs/promises";
import { parse } from "csv-parse";
import { finished } from "stream/promises";
import { ExcludedTransaction } from "../dto/excluded-transaction";
import { join } from "path";
import { logger } from "../logger";

export class ExcludedTransactionService {
  private static instance: ExcludedTransactionService;

  private excludedTransactions: ExcludedTransaction[] | null = null;
  private readonly csvPath = join(process.cwd(), "excluded_transactions.csv");

  private constructor() {}

  public static getInstance(): ExcludedTransactionService {
    if (!ExcludedTransactionService.instance) {
      ExcludedTransactionService.instance = new ExcludedTransactionService();
    }
    return ExcludedTransactionService.instance;
  }

  async getTransactions(): Promise<ExcludedTransaction[]> {
    try {
      await access(this.csvPath, constants.F_OK);
    } catch (ex) {
      logger.trace(ex, "No excluded_transactions.csv detected.");
      return [];
    }

    if (!this.excludedTransactions) {
      this.excludedTransactions = await this.parseExcludedTransactionCSV();
      logger.trace(this.excludedTransactions, "CSV saved to Cache");
    }

    return this.excludedTransactions;
  }

  private async parseExcludedTransactionCSV(): Promise<ExcludedTransaction[]> {
    const records: ExcludedTransaction[] = [];
    const csvPath = join(this.csvPath);

    try {
      const parser = createReadStream(csvPath).pipe(
        parse({
          from_line: 1,
          skip_empty_lines: true,
          trim: true,
          delimiter: ",",
          relaxColumnCount: true,
          skipEmptyLines: true,
        })
      );

      parser.on("readable", function () {
        let record;
        while ((record = parser.read()) !== null) {
          records.push({
            description: record[0] || "",
            amount: record[1] || "",
          });
        }
      });

      parser.on("error", (error) => {
        console.error("Error parsing CSV:", error);
        throw error;
      });

      await finished(parser);

      return records;
    } catch (error) {
      console.error("Failed to read excluded transactions:", error);
      throw error;
    }
  }
}
