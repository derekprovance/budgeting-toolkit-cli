import { CategoryService } from '../../../src/services/core/category.service';
import { FireflyApiClient, CategoryArray, CategoryRead } from '@derekprovance/firefly-iii-sdk';

jest.mock('@derekprovance/firefly-iii-sdk');

describe('CategoryService', () => {
    let service: CategoryService;
    let mockApiClient: jest.Mocked<FireflyApiClient>;

    beforeEach(() => {
        mockApiClient = {
            get: jest.fn(),
        } as unknown as jest.Mocked<FireflyApiClient>;
        service = new CategoryService(mockApiClient);
    });

    describe('getCategories', () => {
        it('should return categories from the API', async () => {
            const mockCategories: CategoryRead[] = [
                {
                    id: '1',
                    attributes: { name: 'Category 1' },
                },
                {
                    id: '2',
                    attributes: { name: 'Category 2' },
                },
            ] as CategoryRead[];

            mockApiClient.get.mockResolvedValueOnce({
                data: mockCategories,
            } as CategoryArray);

            const result = await service.getCategories();

            expect(result).toEqual([{ name: 'Category 1' }, { name: 'Category 2' }]);
            expect(mockApiClient.get).toHaveBeenCalledWith('/categories');
        });

        it('should throw error when API call fails', async () => {
            mockApiClient.get.mockRejectedValueOnce(new Error('API Error'));

            await expect(service.getCategories()).rejects.toThrow('API Error');
        });
    });
});
