import { CategoryProperties } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { ICategoryService } from './category.service.interface.js';
import { fetchAllPages, PAGE_SIZE } from '../../utils/pagination.utils.js';

export class CategoryService implements ICategoryService {
    constructor(private readonly client: FireflyClientWithCerts) {}

    async getCategories(): Promise<CategoryProperties[]> {
        const categories = await fetchAllPages(
            page => this.client.categories.listCategory(undefined, PAGE_SIZE, page),
            'fetch categories'
        );
        return categories.map(category => category.attributes);
    }
}
