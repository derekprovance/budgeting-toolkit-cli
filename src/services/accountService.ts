import { FireflyApiClient } from "../api/client";

export class AccountService {
  constructor(private apiClient: FireflyApiClient) {}

  async getAccounts(): Promise<any> {
    return this.apiClient.get("/accounts");
  }
}
