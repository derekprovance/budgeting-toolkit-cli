import {
    Category,
    CategoryArray,
    FireflyApiClient,
    FireflyApiError,
} from "@derekprovance/firefly-iii-sdk";

export class CategoryService {
    constructor(private readonly apiClient: FireflyApiClient) {}

    async getCategories(): Promise<Category[]> {
        const response = await this.apiClient.get<CategoryArray>(`/categories`);
        if (!response || !response.data) {
            throw new FireflyApiError("Failed to fetch categories");
        }
        return response.data.map((category) => category.attributes);
    }
}
