export class LLMResponseValidator {
    static validateCategoryResponse(
      response: string,
      validCategories: string[]
    ): string {
      if (!response) {
        throw new Error("Empty response from AI");
      }
  
      const trimmedResponse = response.trim();
      
      if (!validCategories.includes(trimmedResponse)) {
        throw new Error(
          `Invalid category "${trimmedResponse}". Must be one of: ${validCategories.join(", ")}`
        );
      }
  
      return trimmedResponse;
    }
  
    static validateBudgetResponse(
      response: string,
      validBudgets: string[]
    ): string {
      if (!response) {
        return ""; // Empty response is valid for budgets
      }
  
      const trimmedResponse = response.trim();
      
      if (!validBudgets.includes(trimmedResponse)) {
        throw new Error(
          `Invalid budget "${trimmedResponse}". Must be one of: ${validBudgets.join(", ")}`
        );
      }
  
      return trimmedResponse;
    }
  
    static validateBatchResponses(
      responses: string[],
      validator: (response: string) => string
    ): string[] {
      if (!Array.isArray(responses)) {
        throw new Error("AI response must be an array");
      }
  
      return responses.map((response, index) => {
        try {
          return validator(response);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          throw new Error(`Invalid response at index ${index}: ${errorMessage}`);
        }
      });
    }
  }