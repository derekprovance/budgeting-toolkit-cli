import { logger } from "../logger";
import { AccountService } from "../services/account.service";

export const getAccounts = async (
  accountService: AccountService
): Promise<void> => {
  try {
    const accounts = await accountService.getAccounts();
    //TODO - think about the console export
    console.log(JSON.stringify(accounts, null, 2));
  } catch (error) {
    logger.error("Error fetching accounts:", JSON.stringify(error));
  }
};
