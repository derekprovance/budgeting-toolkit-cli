import { BUSINESS_CONSTANTS } from './business-constants.js';

/**
 * Utility class for emoji selection based on status, variance, and categories
 * Provides consistent emoji indicators for the report display
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
        // Same boundary as BudgetAnalyticsService.determineStatus
        if (percentage >= BUSINESS_CONSTANTS.BUDGET.ON_TRACK_THRESHOLD) {
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
    static getBillVarianceEmoji(
        variance: number,
        predictedAmount: number,
        isUpcoming: boolean = false
    ): string {
        // A bill that has not come around yet is not "under budget" — it is
        // simply unpaid, and rendering it green alongside genuinely cheap bills
        // invites the reader to bank money they still owe. Whether it counts as
        // upcoming is BillDetailDto's call, not ours.
        if (isUpcoming) {
            return '⏳';
        }

        // Handle zero predicted amount case
        if (predictedAmount === 0) {
            return variance > 0 ? '🔴' : '🟢';
        }

        const percentageOver = (variance / Math.abs(predictedAmount)) * 100;

        if (percentageOver > BUSINESS_CONSTANTS.VARIANCE.CRITICAL_VARIANCE_PERCENT) {
            return '🔴'; // Significantly over
        }
        if (percentageOver > BUSINESS_CONSTANTS.VARIANCE.WARNING_VARIANCE_PERCENT) {
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
        // Whole words only: a substring test sent "Healthcare" to 🚗 via "car"
        // and "Parent" to 🏠 via "rent"
        const words = ` ${(categoryName ?? '')
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .join(' ')} `;
        const match = CATEGORY_EMOJIS.find(([, keywords]) =>
            keywords.some(keyword => words.includes(` ${keyword} `))
        );
        return match ? match[0] : '📊';
    }
}

/** First match wins; multi-word keywords match as a phrase */
const CATEGORY_EMOJIS: [string, string[]][] = [
    [
        '💰',
        ['investment', 'investments', 'retirement', 'vanguard', '401k', '401', 'ira', 'savings'],
    ],
    ['🏠', ['rent', 'mortgage', 'housing', 'home', 'property']],
    ['📱', ['phone', 'mobile', 'internet', 'telecom', 'wifi']],
    ['🍔', ['groceries', 'grocery', 'food', 'dining', 'restaurant', 'restaurants', 'supermarket']],
    [
        '🚗',
        [
            'transport',
            'transportation',
            'car',
            'vehicle',
            'gas',
            'fuel',
            'parking',
            'insurance',
            'auto',
        ],
    ],
    ['🎮', ['entertainment', 'movies', 'gaming', 'going out']],
    ['🏥', ['health', 'healthcare', 'medical', 'fitness', 'gym', 'doctor', 'pharmacy']],
];
