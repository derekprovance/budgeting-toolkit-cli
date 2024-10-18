import { AccountService } from "../services/accountService";

export const getAccounts = async (
  accountService: AccountService
): Promise<void> => {
  try {
    const accounts = await accountService.getAccounts();
    console.log(JSON.stringify(accounts, null, 2));
  } catch (error) {
    console.error("Error fetching accounts:", JSON.stringify(error));
  }
};
