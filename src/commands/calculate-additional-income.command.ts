import { AdditionalIncomeService } from "../services/additional-income.service";
import { PrinterService } from "../services/printer.service";

export const calculateAdditionalIncome = async (
  additionalIncomeService: AdditionalIncomeService,
  month: number
) => {
  console.log("Calculating additional income...");

  const results = await additionalIncomeService.calculateAdditionalIncome(
    month
  );

  PrinterService.printTransactions(results, "Additional Income");
};
