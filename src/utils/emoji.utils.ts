import { BUSINESS_CONSTANTS } from './business-constants.js';

export class EmojiUtils {
    static readonly UPCOMING_BILL_EMOJI = '⏳';

    /** For a budget total that is not over its limit. */
    static getStatusEmoji(percentage: number): string {
        // Same boundary as BudgetAnalyticsService.determineStatus
        if (percentage >= BUSINESS_CONSTANTS.BUDGET.ON_TRACK_THRESHOLD) {
            return '🟡';
        }
        return '🟢';
    }

    /** `variance` is actual minus predicted (positive = over). */
    static getBillVarianceEmoji(variance: number, predictedAmount: number): string {
        if (predictedAmount === 0) {
            return variance > 0 ? '🔴' : '🟢';
        }

        const percentageOver = (variance / Math.abs(predictedAmount)) * 100;

        if (percentageOver > BUSINESS_CONSTANTS.VARIANCE.CRITICAL_VARIANCE_PERCENT) {
            return '🔴';
        }
        if (percentageOver > BUSINESS_CONSTANTS.VARIANCE.WARNING_VARIANCE_PERCENT) {
            return '🟡';
        }
        return '🟢';
    }

    static getCategoryEmoji(categoryName: string | undefined): string {
        // Whole words only: a substring test would send "Parent" to 🏠 via "rent"
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
