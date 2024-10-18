import { AccountService } from "../accountService";
import { ApiClient } from "../../api/client";

describe("AccountService", () => {
  let mockApiClient: jest.Mocked<ApiClient>;
  let accountService: AccountService;

  beforeEach(() => {
    mockApiClient = {
      get: jest.fn(),
      post: jest.fn(),
    };
    accountService = new AccountService(mockApiClient);
  });

  it("should fetch accounts", async () => {
    const mockAccounts = [{ id: 1, name: "Test Account" }];
    mockApiClient.get.mockResolvedValue(mockAccounts);

    const result = await accountService.getAccounts();

    expect(mockApiClient.get).toHaveBeenCalledWith("/accounts");
    expect(result).toEqual(mockAccounts);
  });
});
