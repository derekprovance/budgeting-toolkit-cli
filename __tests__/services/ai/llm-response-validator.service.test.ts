import { LLMResponseValidator } from '../../../src/services/ai/llm-response-validator.service';

describe('LLMResponseValidator', () => {
  const categories = ['Coffee & Tea', 'Dining Out'];
  const budgets = ['Groceries', 'Dining Out'];

  describe('validateCategoryResponse', () => {
    it('returns exact match', () => {
      expect(LLMResponseValidator.validateCategoryResponse('Coffee & Tea', categories)).toBe('Coffee & Tea');
    });
    it('returns fuzzy match', () => {
      expect(LLMResponseValidator.validateCategoryResponse('Coffee and Tea', categories)).toBe('Coffee & Tea');
    });
    it('throws on invalid', () => {
      expect(() => LLMResponseValidator.validateCategoryResponse('Invalid', categories)).toThrow();
    });
    it('throws on empty', () => {
      expect(() => LLMResponseValidator.validateCategoryResponse('', categories)).toThrow();
    });
  });

  describe('validateBudgetResponse', () => {
    it('returns exact match', () => {
      expect(LLMResponseValidator.validateBudgetResponse('Groceries', budgets)).toBe('Groceries');
    });
    it('returns fuzzy match', () => {
      expect(LLMResponseValidator.validateBudgetResponse('Grocerie', budgets)).toBe('Groceries');
    });
    it('returns empty string for empty', () => {
      expect(LLMResponseValidator.validateBudgetResponse('', budgets)).toBe('');
    });
    it('throws on invalid', () => {
      expect(() => LLMResponseValidator.validateBudgetResponse('Invalid', budgets)).toThrow();
    });
  });

  describe('editDistance', () => {
    it('returns 0 for identical strings', () => {
      // @ts-expect-error Testing private method
      expect(LLMResponseValidator.editDistance('a', 'a')).toBe(0);
    });
    it('returns correct edit distance', () => {
      // @ts-expect-error Testing private method
      expect(LLMResponseValidator.editDistance('kitten', 'sitting')).toBe(3);
    });
  });
}); 