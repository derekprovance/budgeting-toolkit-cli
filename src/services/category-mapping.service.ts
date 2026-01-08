import { EmojiUtils } from '../utils/emoji.utils.js';

/**
 * Service for mapping transaction/budget categories to emoji indicators
 * Provides centralized category-to-emoji mapping for consistent display
 */
export class CategoryMappingService {
    /**
     * Gets an emoji for a given category name
     * Delegates to EmojiUtils which provides the mapping logic
     * @param categoryName The category name to map
     * @returns Emoji string representing the category
     */
    getCategoryEmoji(categoryName: string | undefined): string {
        return EmojiUtils.getCategoryEmoji(categoryName);
    }

    /**
     * Gets the status emoji for a budget based on its usage percentage
     * @param percentageUsed The percentage of budget used (0-100+)
     * @param isOverBudget Whether the budget is over its limit
     * @returns Status emoji (🔴🟡🟢)
     */
    getStatusEmoji(percentageUsed: number, isOverBudget: boolean): string {
        return EmojiUtils.getStatusEmoji(percentageUsed, isOverBudget);
    }

    /**
     * Gets the variance emoji for a bill based on predicted vs actual
     * @param variance The actual - predicted amount
     * @param predictedAmount The predicted/expected amount
     * @returns Variance emoji (🔴🟡🟢)
     */
    getBillVarianceEmoji(variance: number, predictedAmount: number): string {
        return EmojiUtils.getBillVarianceEmoji(variance, predictedAmount);
    }
}
