export class LLMResponseValidator {
    private static readonly FUZZY_MATCH_THRESHOLD = 0.7;

    static validateCategoryResponse(response: string, validCategories: string[]): string {
        if (!response) {
            throw new Error('Empty response from AI');
        }

        const trimmedResponse = response.trim();

        // Exact match
        if (validCategories.includes(trimmedResponse)) {
            return trimmedResponse;
        }

        // Fuzzy match
        const fuzzyMatch = this.findFuzzyMatch(trimmedResponse, validCategories);
        if (fuzzyMatch) {
            return fuzzyMatch;
        }

        throw new Error(
            `Invalid category "${trimmedResponse}". Must be one of: ${validCategories.join(', ')}`
        );
    }

    static validateBudgetResponse(response: string, validBudgets: string[]): string {
        if (!response) {
            return ''; // Empty response is valid for budgets
        }

        const trimmedResponse = response.trim();

        // Exact match
        if (validBudgets.includes(trimmedResponse)) {
            return trimmedResponse;
        }

        // Fuzzy match
        const fuzzyMatch = this.findFuzzyMatch(trimmedResponse, validBudgets);
        if (fuzzyMatch) {
            return fuzzyMatch;
        }

        throw new Error(
            `Invalid budget "${trimmedResponse}". Must be one of: ${validBudgets.join(', ')}`
        );
    }

    static validateBatchResponses(
        responses: string[],
        validator: (response: string) => string
    ): string[] {
        if (!Array.isArray(responses)) {
            throw new Error('AI response must be an array');
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

    private static findFuzzyMatch(input: string, validOptions: string[]): string | null {
        const normalizedInput = this.normalizeString(input);

        for (const option of validOptions) {
            const normalizedOption = this.normalizeString(option);
            const similarity = this.calculateSimilarity(normalizedInput, normalizedOption);

            if (similarity >= this.FUZZY_MATCH_THRESHOLD) {
                return option;
            }
        }

        return null;
    }

    private static normalizeString(str: string): string {
        return str.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    }

    private static calculateSimilarity(str1: string, str2: string): number {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        const longerLength = longer.length;

        if (longerLength === 0) {
            return 1.0;
        }

        return (longerLength - this.editDistance(longer, shorter)) / longerLength;
    }

    private static editDistance(s1: string, s2: string): number {
        s1 = s1.toLowerCase();
        s2 = s2.toLowerCase();

        const costs = new Array(s2.length + 1);
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else {
                    if (j > 0) {
                        let newValue = costs[j - 1];
                        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                        }
                        costs[j - 1] = lastValue;
                        lastValue = newValue;
                    }
                }
            }
            if (i > 0) {
                costs[s2.length] = lastValue;
            }
        }
        return costs[s2.length];
    }
}
