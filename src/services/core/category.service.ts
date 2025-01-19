import { Category, CategoryArray, CategoryRead, FireflyApiClient, FireflyApiError } from "@derekprovance/firefly-iii-sdk";

export class CategoryService {
  constructor(private readonly apiClient: FireflyApiClient) {}

  async getCategories(): Promise<Category[]> {
    const categories = await this.fetchCategories();

    return categories.map(category => category.attributes);
  }

  private async fetchCategories(): Promise<CategoryRead[]> {
    const response = await this.apiClient.get<CategoryArray>(`/categories`);
    if (!response) {
      throw new FireflyApiError('Failed to fetch categories');
    }
    return response.data;
  }
}
