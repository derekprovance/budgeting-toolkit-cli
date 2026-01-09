import { TransactionSplit } from '@derekprovance/firefly-iii-sdk';

/**
 * DTO for unbudgeted transaction with category emoji
 * Used to display unbudgeted expenses with visual category indicators
 */
export interface CategorizedUnbudgetedDto {
    /**
     * The original transaction from Firefly III
     */
    transaction: TransactionSplit;

    /**
     * Emoji representing the transaction category
     * Examples: 💰 (investment), 🏠 (housing), 📱 (phone), 🍔 (groceries), 🚗 (transport)
     */
    categoryEmoji: string;

    /**
     * Optional category name if determined from transaction
     * Could be from category_name, budget_name, or description keywords
     */
    categoryName?: string;
}
