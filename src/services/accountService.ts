import { ApiClient } from "../api/client";

export class AccountService {
  constructor(private apiClient: ApiClient) {}

  async getAccounts(): Promise<any> {
    return this.apiClient.get("/accounts");
  }
}
