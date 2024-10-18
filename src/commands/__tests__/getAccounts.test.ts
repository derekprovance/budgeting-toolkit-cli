import { getAccounts } from '../getAccounts';
import { AccountService } from '../../services/accountService';

jest.mock('../../services/accountService');

describe('getAccounts command', () => {
  let mockAccountService: jest.Mocked<AccountService>;
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockAccountService = {
      getAccounts: jest.fn(),
    } as any;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should log account data when service call is successful', async () => {
    const mockAccounts = [{ id: 1, name: 'Test Account' }];
    mockAccountService.getAccounts.mockResolvedValue(mockAccounts);

    await getAccounts(mockAccountService);

    expect(mockAccountService.getAccounts).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockAccounts, null, 2));
  });

  it('should log error when service call fails with Error object', async () => {
    const error = new Error('Service Error');
    mockAccountService.getAccounts.mockRejectedValue(error);

    await getAccounts(mockAccountService);

    expect(mockAccountService.getAccounts).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error fetching accounts:', 'Service Error');
  });
});