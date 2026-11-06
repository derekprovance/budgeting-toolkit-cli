import { CategoryProperties, BudgetRead, TransactionSplit } from '@derekprovance/firefly-iii-sdk';
import { Result, TransactionValidationError } from '../../types/result.type.js';
import { ICategoryService } from './category.service.interface.js';
import { IBudgetService } from './budget.service.interface.js';
import { logger } from '../../logger.js';
import { StringUtils } from '../../utils/string.utils.js';

type NamedCategory = CategoryProperties & { name: string };

export interface ResolvedSuggestion {
    category?: CategoryProperties;
    budget?: BudgetRead;
}

/**
 * The categories and budgets `categorize` can assign, fetched once per run.
 * Names match case-insensitively and ignoring surrounding whitespace
 * (`StringUtils.normalizeForMatching`), and resolve to Firefly's spelling.
 */
export class CategoryBudgetCatalog {
    private readonly categoriesByName: ReadonlyMap<string, NamedCategory>;
    private readonly budgetsByName: ReadonlyMap<string, BudgetRead>;

    private constructor(categories: CategoryProperties[], budgets: BudgetRead[]) {
        this.categoriesByName = new Map(
            categories
                .filter((c): c is NamedCategory => !!c.name)
                .map(c => [StringUtils.normalizeForMatching(c.name), c])
        );
        this.budgetsByName = new Map(
            budgets.map(b => [StringUtils.normalizeForMatching(b.attributes.name), b])
        );
    }

    static async load(
        categoryService: ICategoryService,
        budgetService: IBudgetService
    ): Promise<CategoryBudgetCatalog> {
        const [categories, budgets] = await Promise.all([
            categoryService.getCategories(),
            budgetService.getBudgets(),
        ]);
        return new CategoryBudgetCatalog(categories, budgets);
    }

    /** Sorted */
    categoryNames(): string[] {
        return Array.from(this.categoriesByName.values(), c => c.name).sort();
    }

    /** Sorted */
    budgetNames(): string[] {
        return Array.from(this.budgetsByName.values(), b => b.attributes.name).sort();
    }

    findCategory(name: string | null | undefined): CategoryProperties | undefined {
        return name ? this.categoriesByName.get(StringUtils.normalizeForMatching(name)) : undefined;
    }

    findBudget(name: string | null | undefined): BudgetRead | undefined {
        return name ? this.budgetsByName.get(StringUtils.normalizeForMatching(name)) : undefined;
    }

    /**
     * Resolves suggested names for `transaction`; an absent name stays
     * unresolved. Errs on the first name that is not in the catalog.
     */
    resolve(
        transaction: TransactionSplit,
        suggestion: { category?: string; budget?: string }
    ): Result<ResolvedSuggestion, TransactionValidationError> {
        const category = this.findCategory(suggestion.category);
        if (suggestion.category && !category) {
            return Result.err(this.unknownNameError(transaction, 'category', suggestion.category));
        }
        const budget = this.findBudget(suggestion.budget);
        if (suggestion.budget && !budget) {
            return Result.err(this.unknownNameError(transaction, 'budget', suggestion.budget));
        }
        return Result.ok({ category, budget });
    }

    private unknownNameError(
        transaction: TransactionSplit,
        field: 'category' | 'budget',
        name: string
    ): TransactionValidationError {
        const error: TransactionValidationError = {
            field,
            message: `Invalid or unrecognized ${field} from AI: "${name}"`,
            userMessage: `The suggested ${field} "${name}" doesn't exist. Please choose a valid ${field} or create it first.`,
            transactionId: transaction.transaction_journal_id || 'unknown',
            transactionDescription: transaction.description || 'No description',
        };
        logger.warn({ transactionId: error.transactionId, name }, error.message);
        return error;
    }
}
