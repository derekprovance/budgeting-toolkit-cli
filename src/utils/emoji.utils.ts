/**
 * Utility class for emoji selection based on status, variance, and categories
 * Provides consistent emoji indicators for the enhanced report display
 */
export class EmojiUtils {
    /**
     * Gets a status emoji based on budget percentage and overage status
     * @param percentage The percentage of budget used (0-100+)
     * @param isOverBudget Whether the budget is over the limit
     * @returns Status emoji: 🔴 (over), 🟡 (warning), or 🟢 (good)
     */
    static getStatusEmoji(percentage: number, isOverBudget: boolean): string {
        if (isOverBudget) {
            return '🔴';
        }
        if (percentage > 85) {
            return '🟡';
        }
        return '🟢';
    }

    /**
     * Gets a bill variance emoji based on the variance from predicted amount
     * @param variance The actual - predicted amount (positive = over, negative = under)
     * @param predictedAmount The expected/predicted bill amount
     * @returns Emoji indicating bill variance status
     */
    static getBillVarianceEmoji(variance: number, predictedAmount: number): string {
        // Handle zero predicted amount case
        if (predictedAmount === 0) {
            return variance > 0 ? '🔴' : '🟢';
        }

        const percentageOver = (variance / Math.abs(predictedAmount)) * 100;

        if (percentageOver > 20) {
            return '🔴'; // Significantly over
        }
        if (percentageOver > 10) {
            return '🟡'; // Moderately over
        }
        return '🟢'; // On track or under
    }

    /**
     * Gets a category emoji based on category name
     * Maps common budget categories to representative emojis
     * @param categoryName The category name from transaction/budget
     * @returns Emoji representing the category, or default 📊
     */
    static getCategoryEmoji(categoryName: string | undefined): string {
        if (!categoryName) {
            return '📊';
        }

        const normalizedName = categoryName.toLowerCase().trim();

        // Investment/Retirement categories
        if (
            normalizedName.includes('investment') ||
            normalizedName.includes('retirement') ||
            normalizedName.includes('vanguard') ||
            normalizedName.includes('401') ||
            normalizedName.includes('ira') ||
            normalizedName.includes('savings')
        ) {
            return '💰';
        }

        // Housing/Rent/Mortgage categories
        if (
            normalizedName.includes('rent') ||
            normalizedName.includes('mortgage') ||
            normalizedName.includes('housing') ||
            normalizedName.includes('home') ||
            normalizedName.includes('property')
        ) {
            return '🏠';
        }

        // Phone/Mobile/Internet/Telecom categories
        if (
            normalizedName.includes('phone') ||
            normalizedName.includes('mobile') ||
            normalizedName.includes('internet') ||
            normalizedName.includes('telecom') ||
            normalizedName.includes('wifi')
        ) {
            return '📱';
        }

        // Groceries/Food/Dining categories
        if (
            normalizedName.includes('groceries') ||
            normalizedName.includes('food') ||
            normalizedName.includes('dining') ||
            normalizedName.includes('restaurant') ||
            normalizedName.includes('grocery') ||
            normalizedName.includes('supermarket')
        ) {
            return '🍔';
        }

        // Transport/Car/Vehicle/Gas categories
        if (
            normalizedName.includes('transport') ||
            normalizedName.includes('car') ||
            normalizedName.includes('vehicle') ||
            normalizedName.includes('gas') ||
            normalizedName.includes('fuel') ||
            normalizedName.includes('parking') ||
            normalizedName.includes('insurance') ||
            normalizedName.includes('auto')
        ) {
            return '🚗';
        }

        // Entertainment/Movies/Gaming categories
        if (
            normalizedName.includes('entertainment') ||
            normalizedName.includes('movies') ||
            normalizedName.includes('gaming') ||
            normalizedName.includes('going out')
        ) {
            return '🎮';
        }

        // Health/Medical/Fitness categories
        if (
            normalizedName.includes('health') ||
            normalizedName.includes('medical') ||
            normalizedName.includes('fitness') ||
            normalizedName.includes('gym') ||
            normalizedName.includes('doctor') ||
            normalizedName.includes('pharmacy')
        ) {
            return '🏥';
        }

        // Default category indicator
        return '📊';
    }
}
