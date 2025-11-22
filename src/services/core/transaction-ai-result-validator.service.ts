import { CategoryProperties, BudgetRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { Result, TransactionValidationError } from '../../types/result.type.js';
import { TransactionValidatorService } from './transaction-validator.service.js';
import { CategoryService } from './category.service.js';
import { BudgetService } from './budget.service.js';
import { logger } from '../../logger.js';

export interface AIValidationResult {
    category?: CategoryProperties;
    budget?: BudgetRead;
}

/**
 * Service for validating AI-suggested categories and budgets for transactions.
 * Uses O(1) lookup maps for performance optimization.
 */
export class TransactionAIResultValidator {
    private categoryLookup: Map<string, CategoryProperties> = new Map();
    private budgetLookup: Map<string, BudgetRead> = new Map();

    constructor(
        private readonly categoryService: CategoryService,
        private readonly budgetService: BudgetService,
        private readonly transactionValidator: TransactionValidatorService
    ) {}

    /**
     * Initializes lookup maps for categories and budgets.
     * Should be called before validating transactions.
     * Uses O(1) map lookups instead of O(n) array.find() for better performance.
     */
    async initialize(): Promise<void> {
        const [categories, budgets] = await Promise.all([
            this.categoryService.getCategories(),
            this.budgetService.getBudgets(),
        ]);

        // Build O(1) lookup maps
        this.categoryLookup = new Map(
            categories
                .filter(c => c?.name) // Filter out categories without names
                .map(c => [c.name!, c])
        );

        this.budgetLookup = new Map(
            budgets.filter(b => b.attributes?.name).map(b => [b.attributes.name, b])
        );

        logger.debug(
            {
                categoryCount: this.categoryLookup.size,
                budgetCount: this.budgetLookup.size,
            },
            'TransactionAIResultValidator initialized lookup maps'
        );
    }

    /**
     * Validates AI-suggested category and budget for a transaction.
     * Returns Result with validated data or detailed error information.
     *
     * @param transaction The transaction being validated
     * @param aiCategory AI-suggested category name
     * @param aiBudget AI-suggested budget name
     * @returns Result containing validated category/budget or error details
     */
    async validateAIResults(
        transaction: TransactionSplit,
        aiCategory?: string,
        aiBudget?: string
    ): Promise<Result<AIValidationResult, TransactionValidationError>> {
        const transactionId = transaction.transaction_journal_id || 'unknown';
        const description = transaction.description || 'No description';

        // Validate category if provided
        let category: CategoryProperties | undefined;
        if (aiCategory && aiCategory !== '') {
            category = this.categoryLookup.get(aiCategory);

            if (!category) {
                const error: TransactionValidationError = {
                    field: 'category',
                    message: `Invalid or unrecognized category from AI: "${aiCategory}"`,
                    userMessage: `The suggested category "${aiCategory}" doesn't exist. Please choose a valid category or create it first.`,
                    transactionId,
                    transactionDescription: description,
                    details: {
                        suggestedCategory: aiCategory,
                        availableCategories: Array.from(this.categoryLookup.keys()).slice(0, 10),
                    },
                };

                logger.warn(
                    {
                        transactionId,
                        description,
                        aiCategory,
                        availableCount: this.categoryLookup.size,
                    },
                    error.message
                );

                return Result.err(error);
            }
        }

        // Check if budget should be validated for this transaction type
        const shouldUpdateBudget = await this.transactionValidator.shouldSetBudget(transaction);

        // Validate budget if provided and appropriate for transaction type
        let budget: BudgetRead | undefined;
        if (shouldUpdateBudget && aiBudget && aiBudget !== '') {
            budget = this.budgetLookup.get(aiBudget);

            if (!budget) {
                const error: TransactionValidationError = {
                    field: 'budget',
                    message: `Invalid or unrecognized budget from AI: "${aiBudget}"`,
                    userMessage: `The suggested budget "${aiBudget}" doesn't exist. Please choose a valid budget or create it first.`,
                    transactionId,
                    transactionDescription: description,
                    details: {
                        suggestedBudget: aiBudget,
                        availableBudgets: Array.from(this.budgetLookup.keys()).slice(0, 10),
                    },
                };

                logger.warn(
                    {
                        transactionId,
                        description,
                        aiBudget,
                        availableCount: this.budgetLookup.size,
                    },
                    error.message
                );

                return Result.err(error);
            }
        }

        // Log warning if budget was suggested but shouldn't be set for this transaction type
        if (!shouldUpdateBudget && aiBudget && aiBudget !== '') {
            logger.debug(
                {
                    transactionId,
                    description,
                    aiBudget,
                    type: transaction.type,
                },
                'Budget suggestion ignored - transaction type should not have budget assigned'
            );
        }

        return Result.ok({ category, budget });
    }

    /**
     * Gets a category by name using O(1) lookup
     */
    getCategoryByName(name: string): CategoryProperties | undefined {
        return this.categoryLookup.get(name);
    }

    /**
     * Gets a budget by name using O(1) lookup
     */
    getBudgetByName(name: string): BudgetRead | undefined {
        return this.budgetLookup.get(name);
    }

    /**
     * Gets all available category names
     */
    getAvailableCategoryNames(): string[] {
        return Array.from(this.categoryLookup.keys()).sort();
    }

    /**
     * Gets all available budget names
     */
    getAvailableBudgetNames(): string[] {
        return Array.from(this.budgetLookup.keys()).sort();
    }

    /**
     * Refreshes the lookup maps with latest data from services
     */
    async refresh(): Promise<void> {
        await this.initialize();
    }
}
