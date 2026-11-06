import { CategoryService } from '../../../src/services/core/category.service.js';
import { CategoryArray, CategoryRead } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../../src/api/firefly-client-with-certs.js';
import { jest } from '@jest/globals';
import { createMockFireflyClient } from '../../shared/mocks.js';
import { PAGE_SIZE } from '../../../src/utils/pagination.utils.js';

describe('CategoryService', () => {
    let service: CategoryService;
    let mockClient: jest.Mocked<FireflyClientWithCerts>;

    beforeEach(() => {
        mockClient = createMockFireflyClient();
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

            jest.mocked(mockClient.categories.listCategory).mockResolvedValueOnce({
                data: mockCategories,
            } as CategoryArray);

            const result = await service.getCategories();

            expect(result).toEqual([{ name: 'Category 1' }, { name: 'Category 2' }]);
            expect(mockClient.categories.listCategory).toHaveBeenCalled();
        });

        it('should read every page of categories', async () => {
            const page = (name: string, current: number) =>
                ({
                    data: [{ type: 'categories', id: name, attributes: { name } }],
                    meta: { pagination: { current_page: current, total_pages: 2 } },
                }) as CategoryArray;
            jest.mocked(mockClient.categories.listCategory)
                .mockResolvedValueOnce(page('Groceries', 1))
                .mockResolvedValueOnce(page('Dining', 2));

            const result = await service.getCategories();

            expect(result).toEqual([{ name: 'Groceries' }, { name: 'Dining' }]);
            expect(mockClient.categories.listCategory).toHaveBeenNthCalledWith(
                2,
                undefined,
                PAGE_SIZE,
                2
            );
        });

        it('should throw error when API call fails', async () => {
            jest.mocked(mockClient.categories.listCategory).mockRejectedValueOnce(
                new Error('API Error')
            );

            await expect(service.getCategories()).rejects.toThrow('API Error');
        });
    });
});
