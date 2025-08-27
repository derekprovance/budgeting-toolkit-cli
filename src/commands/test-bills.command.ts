import { ExpectedBillService } from "../services/expected-bill.service";
import { Command } from "../types/interface/command.interface";
import { BudgetDateParams } from "../types/interface/budget-date-params.interface";
import { logger } from "../logger";

export class BillsCommand implements Command<void, BudgetDateParams> {
  constructor(private readonly expectedBillService: ExpectedBillService) {}

  async execute(params: BudgetDateParams): Promise<void> {
    try {
      const { month, year } = params;

      console.log(`Expected Bills Report for ${month}/${year}\n`);

      // Get expected bill sum for the month
      const monthlySum = await this.expectedBillService.getExpectedBillSumForMonth(month, year);
      
      // Get average monthly bills for the year
      const yearlyAverage = await this.expectedBillService.getAverageMonthlyBillsForYear(year);

      // Display results
      console.log(`Expected bill sum for ${month}/${year}: $${monthlySum.toFixed(2)}`);
      console.log(`Average monthly bills for ${year}: $${yearlyAverage.toFixed(2)}`);

    } catch (error) {
      logger.error('Error calculating expected bills', { error, month: params.month, year: params.year });
      console.error('❌ Error calculating expected bills:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}