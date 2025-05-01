import { LLMResponseValidator } from "../../../src/services/ai/llm-response-validator.service";

describe("LLMResponseValidator", () => {
  describe("validateCategoryResponse", () => {
    const validCategories = [
      "Groceries",
      "Entertainment",
      "Transportation",
      "Healthcare",
    ];

    it("should accept exact matches", () => {
      const result = LLMResponseValidator.validateCategoryResponse(
        "Groceries",
        validCategories
      );
      expect(result).toBe("Groceries");
    });

    it("should accept exact matches with different case", () => {
      const result = LLMResponseValidator.validateCategoryResponse(
        "GROCERIES",
        validCategories
      );
      expect(result).toBe("Groceries");
    });

    it("should accept fuzzy matches above threshold", () => {
      const result = LLMResponseValidator.validateCategoryResponse(
        "Groceriess",
        validCategories
      );
      expect(result).toBe("Groceries");
    });

    it("should reject fuzzy matches below threshold", () => {
      expect(() => {
        LLMResponseValidator.validateCategoryResponse("Groc", validCategories);
      }).toThrow("Invalid category");
    });

    it("should reject empty responses", () => {
      expect(() => {
        LLMResponseValidator.validateCategoryResponse("", validCategories);
      }).toThrow("Empty response from AI");
    });

    it("should reject null responses", () => {
      expect(() => {
        LLMResponseValidator.validateCategoryResponse(
          null as unknown as string,
          validCategories
        );
      }).toThrow("Empty response from AI");
    });

    it("should reject undefined responses", () => {
      expect(() => {
        LLMResponseValidator.validateCategoryResponse(
          undefined as unknown as string,
          validCategories
        );
      }).toThrow("Empty response from AI");
    });

    it("should handle special characters in responses", () => {
      const result = LLMResponseValidator.validateCategoryResponse(
        "Groceries!@#$%^&*()",
        validCategories
      );
      expect(result).toBe("Groceries");
    });

    it("should handle whitespace in responses", () => {
      const result = LLMResponseValidator.validateCategoryResponse(
        "  Groceries  ",
        validCategories
      );
      expect(result).toBe("Groceries");
    });
  });

  describe("validateBudgetResponse", () => {
    const validBudgets = ["Food", "Entertainment", "Transport", "Medical"];

    it("should accept exact matches", () => {
      const result = LLMResponseValidator.validateBudgetResponse(
        "Food",
        validBudgets
      );
      expect(result).toBe("Food");
    });

    it("should accept exact matches with different case", () => {
      const result = LLMResponseValidator.validateBudgetResponse(
        "FOOD",
        validBudgets
      );
      expect(result).toBe("Food");
    });

    it("should accept fuzzy matches above threshold", () => {
      const result = LLMResponseValidator.validateBudgetResponse(
        "Foods",
        validBudgets
      );
      expect(result).toBe("Food");
    });

    it("should reject fuzzy matches below threshold", () => {
      expect(() => {
        LLMResponseValidator.validateBudgetResponse("Fo", validBudgets);
      }).toThrow("Invalid budget");
    });

    it("should accept empty responses", () => {
      const result = LLMResponseValidator.validateBudgetResponse(
        "",
        validBudgets
      );
      expect(result).toBe("");
    });

    it("should handle special characters in responses", () => {
      const result = LLMResponseValidator.validateBudgetResponse(
        "Food!@#$%^&*()",
        validBudgets
      );
      expect(result).toBe("Food");
    });

    it("should handle whitespace in responses", () => {
      const result = LLMResponseValidator.validateBudgetResponse(
        "  Food  ",
        validBudgets
      );
      expect(result).toBe("Food");
    });
  });

  describe("validateBatchResponses", () => {
    const validCategories = ["Groceries", "Entertainment", "Transportation"];
    const categoryValidator = (response: string) =>
      LLMResponseValidator.validateCategoryResponse(response, validCategories);

    it("should validate all responses in batch", () => {
      const responses = ["Groceries", "Entertainment", "Transportation"];
      const result = LLMResponseValidator.validateBatchResponses(
        responses,
        categoryValidator
      );
      expect(result).toEqual(["Groceries", "Entertainment", "Transportation"]);
    });

    it("should handle mixed valid and invalid responses", () => {
      const responses = ["Groceries", "Invalid", "Transportation"];
      expect(() => {
        LLMResponseValidator.validateBatchResponses(
          responses,
          categoryValidator
        );
      }).toThrow("Invalid response at index 1");
    });

    it("should reject non-array inputs", () => {
      expect(() => {
        LLMResponseValidator.validateBatchResponses(
          "not an array" as unknown as string[],
          categoryValidator
        );
      }).toThrow("AI response must be an array");
    });

    it("should handle empty arrays", () => {
      const result = LLMResponseValidator.validateBatchResponses(
        [],
        categoryValidator
      );
      expect(result).toEqual([]);
    });

    it("should preserve error messages from validator", () => {
      const responses = ["", "Groceries"];
      expect(() => {
        LLMResponseValidator.validateBatchResponses(
          responses,
          categoryValidator
        );
      }).toThrow("Empty response from AI");
    });

    it("should handle batch with fuzzy matches", () => {
      const responses = ["Groceriess", "Entertainmentt", "Transportationn"];
      const result = LLMResponseValidator.validateBatchResponses(
        responses,
        categoryValidator
      );
      expect(result).toEqual(["Groceries", "Entertainment", "Transportation"]);
    });
  });
});
