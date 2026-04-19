import { CategoryProperties } from '@derekprovance/firefly-iii-sdk';
import { FireflyClientWithCerts } from '../../api/firefly-client-with-certs.js';
import { ICategoryService } from './category.service.interface.js';

export class CategoryService implements ICategoryService {
    constructor(private readonly client: FireflyClientWithCerts) {}

    async getCategories(): Promise<CategoryProperties[]> {
        const response = await this.client.categories.listCategory();
        if (!response || !response.data) {
            throw new Error('Failed to fetch categories');
        }
        return response.data.map(category => category.attributes);
    }
}
