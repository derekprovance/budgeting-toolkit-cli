import { Category, CategoryArray, CategoryRead } from "@derekprovance/firefly-iii-sdk";
import { FireflyApiClient, FireflyApiError } from "../../api/firefly.client";

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
