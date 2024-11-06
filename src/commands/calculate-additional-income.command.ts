import { AdditionalIncomeService } from "../services/additional-income.service";
import { PrinterService } from "../services/printer.service";

export const calculateAdditionalIncome = async (
  additionalIncomeService: AdditionalIncomeService,
  month: number
) => {
  const results = await additionalIncomeService.calculateAdditionalIncome(month);
  PrinterService.printTransactions(results, "Additional Income");
};
