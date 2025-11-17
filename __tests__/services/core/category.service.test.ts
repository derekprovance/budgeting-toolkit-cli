import { CategoryService } from '../../../src/services/core/category.service';
import { CategoryArray, CategoryRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs';

jest.mock('../../../src/api/firefly-client-with-certs');

describe('CategoryService', () => {
    let service: CategoryService;
    let mockClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        mockClient = {
            categories: {
                listCategory: jest.fn(),
            },
        } as unknown as jest.Mocked<FireflyClientWithCerts>;
        service = new CategoryService(mockClient);
    });

    describe('getCategories', () => {
        it('should return categories from the API', async () => {
            const mockCategories: CategoryRead[] = [
                {
                    type: 'categories',
                    id: '1',
                    attributes: { name: 'Category 1' },
                },
                {
                    type: 'categories',
                    id: '2',
                    attributes: { name: 'Category 2' },
                },
            ] as CategoryRead[];

            (mockClient.categories.listCategory as jest.Mock).mockResolvedValueOnce({
                data: mockCategories,
            } as CategoryArray);

            const result = await service.getCategories();

            expect(result).toEqual([{ name: 'Category 1' }, { name: 'Category 2' }]);
            expect(mockClient.categories.listCategory).toHaveBeenCalled();
        });

        it('should throw error when API call fails', async () => {
            (mockClient.categories.listCategory as jest.Mock).mockRejectedValueOnce(new Error('API Error'));

            await expect(service.getCategories()).rejects.toThrow('API Error');
        });
    });
});
