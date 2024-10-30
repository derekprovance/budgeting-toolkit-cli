import { AdditionalIncomeService } from "../services/additional-income.service";

export const calculateAdditionalIncome = async (
  additionalIncomeService: AdditionalIncomeService,
  month: number
) => {
  await additionalIncomeService.calculateAdditionalIncome(month);
};
