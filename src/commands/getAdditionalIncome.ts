import { AdditionalIncomeService } from "../services/additionalIncome.service";

export const getAdditionalIncome = async (
  additionalIncomeService: AdditionalIncomeService,
  month: number
) => {
    await additionalIncomeService.getAdditionalIncome(month);
};
