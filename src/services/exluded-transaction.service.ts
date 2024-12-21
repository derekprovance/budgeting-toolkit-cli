import { createReadStream } from "fs";
import { access, constants } from "fs/promises";
import { parse } from "csv-parse";
import { finished } from "stream/promises";
import { ExcludedTransaction } from "../dto/excluded-transaction";
import { join } from "path";
import { logger } from "../logger";

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

  private static async parseExcludedTransactionCSV(): Promise<
    ExcludedTransaction[]
  > {
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
