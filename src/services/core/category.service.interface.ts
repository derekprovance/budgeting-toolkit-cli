import { CategoryProperties } from '@derekprovance/firefly-iii-sdk';

export interface ICategoryService {
    getCategories(): Promise<CategoryProperties[]>;
}
