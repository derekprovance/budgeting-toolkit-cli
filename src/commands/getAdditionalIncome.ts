import { AdditionalIncomeService } from "../services/additional-income.service";

export const getAdditionalIncome = async (
  additionalIncomeService: AdditionalIncomeService,
  month: number
) => {
  await additionalIncomeService.getAdditionalIncome(month);
};
