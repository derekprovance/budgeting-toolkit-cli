import ora from 'ora';
import chalk from 'chalk';
import { Command } from '../types/interface/command.interface.js';
import { TransactionSplitService, SplitData } from '../services/transaction-split.service.js';
import { SplitTransactionDisplayService } from '../services/display/split-transaction-display.service.js';
import { UserInputService } from '../services/user-input.service.js';
import { CategoryService } from '../services/core/category.service.js';
import { BudgetService } from '../services/core/budget.service.js';

/**
 * Parameters for split transaction command
 */
interface SplitTransactionParams {
    transactionId: string;
    interactive: boolean;
}

/**
 * Command for splitting a transaction into two parts
 */
export class SplitTransactionCommand implements Command<void, SplitTransactionParams> {
    /** Default currency symbol if transaction doesn't specify one */
    private static readonly DEFAULT_CURRENCY_SYMBOL = '$';

    constructor(
        private readonly splitService: TransactionSplitService,
        private readonly displayService: SplitTransactionDisplayService,
        private readonly userInputService: UserInputService,
        private readonly categoryService: CategoryService,
        private readonly budgetService: BudgetService
    ) {}

    async execute({ transactionId, interactive }: SplitTransactionParams): Promise<void> {
        console.log(this.displayService.formatHeader(transactionId));

        const spinner = ora('Fetching transaction...').start();

        try {
            // Fetch the original transaction
            const transaction = await this.splitService.getTransaction(transactionId);

            if (!transaction) {
                spinner.fail(chalk.red(`Transaction ${transactionId} not found`));
                return;
            }
            const splits = transaction.attributes.transactions;

            if (!splits || splits.length === 0) {
                spinner.fail(chalk.red('Transaction has no splits'));
                return;
            }

            if (splits.length > 1) {
                spinner.fail(
                    chalk.red(
                        `Transaction already has ${splits.length} splits. Only single transactions can be split.`
                    )
                );
                return;
            }

            const originalSplit = splits[0];
            const originalAmount = parseFloat(originalSplit.amount);

            spinner.succeed('Transaction fetched');

            // Display original transaction
            console.log(this.displayService.formatOriginalTransaction(originalSplit, transactionId));

            if (!interactive) {
                console.log(chalk.yellow('\nInteractive mode is required for splitting transactions.'));
                console.log(chalk.dim('Use the --interactive or -i flag.'));
                return;
            }

            const currencySymbol =
                originalSplit.currency_symbol || SplitTransactionCommand.DEFAULT_CURRENCY_SYMBOL;

            // Get split amount from user
            const firstSplitAmount = await this.userInputService.getSplitAmount(
                originalAmount,
                currencySymbol
            );

            // Use toFixed to avoid floating-point precision errors
            const secondSplitAmount = parseFloat((originalAmount - firstSplitAmount).toFixed(2));

            // Show remainder
            console.log(this.displayService.formatRemainder(secondSplitAmount, currencySymbol));

            // Get custom text for split 1
            const firstCustomText = await this.userInputService.getCustomSplitText(
                1,
                originalSplit.description
            );
            const firstDescription = firstCustomText
                ? `${originalSplit.description} ${firstCustomText}`
                : originalSplit.description;

            // Get custom text for split 2
            const secondCustomText = await this.userInputService.getCustomSplitText(
                2,
                originalSplit.description
            );
            const secondDescription = secondCustomText
                ? `${originalSplit.description} ${secondCustomText}`
                : originalSplit.description;

            // Prepare split data
            const firstSplitData: SplitData = {
                amount: firstSplitAmount.toFixed(2),
                description: firstDescription,
            };

            const secondSplitData: SplitData = {
                amount: secondSplitAmount.toFixed(2),
                description: secondDescription,
            };

            // Track budget names for display
            let firstBudgetName = originalSplit.budget_name || undefined;
            let secondBudgetName = originalSplit.budget_name || undefined;

            // Ask if user wants to customize split 1 category/budget
            const customizeSplit1 = await this.userInputService.shouldCustomizeSplit(1);

            if (customizeSplit1) {
                const customizations = await this.promptForCustomization(
                    originalSplit.category_name || undefined,
                    originalSplit.budget_name || undefined
                );

                if (customizations.categoryName) {
                    firstSplitData.categoryName = customizations.categoryName;
                }
                if (customizations.budgetId) {
                    firstSplitData.budgetId = customizations.budgetId;
                    firstBudgetName = customizations.budgetName;
                }
            } else {
                // Keep original category and budget
                if (originalSplit.category_name) {
                    firstSplitData.categoryName = originalSplit.category_name;
                }
                if (originalSplit.budget_id) {
                    firstSplitData.budgetId = originalSplit.budget_id;
                }
            }

            // Ask if user wants to customize split 2 category/budget
            const customizeSplit2 = await this.userInputService.shouldCustomizeSplit(2);

            if (customizeSplit2) {
                const customizations = await this.promptForCustomization(
                    originalSplit.category_name || undefined,
                    originalSplit.budget_name || undefined
                );

                if (customizations.categoryName) {
                    secondSplitData.categoryName = customizations.categoryName;
                }
                if (customizations.budgetId) {
                    secondSplitData.budgetId = customizations.budgetId;
                    secondBudgetName = customizations.budgetName;
                }
            } else {
                // Inherit from original
                if (originalSplit.category_name) {
                    secondSplitData.categoryName = originalSplit.category_name;
                }
                if (originalSplit.budget_id) {
                    secondSplitData.budgetId = originalSplit.budget_id;
                }
            }

            // Show preview with parent description
            console.log(
                this.displayService.formatSplitPreview(
                    originalSplit.description, // Parent transaction title
                    firstSplitData.amount,
                    firstSplitData.description || originalSplit.description,
                    firstSplitData.categoryName,
                    firstBudgetName,
                    secondSplitData.amount,
                    secondSplitData.description || originalSplit.description,
                    secondSplitData.categoryName,
                    secondBudgetName,
                    currencySymbol
                )
            );

            // Confirm with user
            const confirmed = await this.userInputService.confirmSplit();

            if (!confirmed) {
                console.log(chalk.yellow('\nSplit cancelled.'));
                return;
            }

            // Execute the split
            spinner.start('Splitting transaction...');

            const result = await this.splitService.splitTransaction(
                transactionId,
                firstSplitData.amount,
                firstSplitData,
                secondSplitData
            );

            if (result.success && result.transaction) {
                spinner.succeed('Transaction split successfully');
                console.log(
                    this.displayService.formatSuccess(
                        transactionId,
                        result.transaction.attributes.transactions?.length || 2
                    )
                );
            } else {
                spinner.fail('Failed to split transaction');
                if (result.error) {
                    console.log(this.displayService.formatError(result.error));
                }
            }
        } catch (error) {
            spinner.fail('Failed to split transaction');
            const errorObject = error instanceof Error ? error : new Error('Unknown error');
            console.log(this.displayService.formatError(errorObject));
            // Error already displayed to user, no need to re-throw
        }
    }

    /**
     * Prompts user for category and budget customization
     */
    private async promptForCustomization(
        currentCategory?: string,
        currentBudget?: string
    ): Promise<{
        categoryName?: string;
        budgetId?: string;
        budgetName?: string;
    }> {
        const result: {
            categoryName?: string;
            budgetId?: string;
            budgetName?: string;
        } = {};

        // Fetch available categories and budgets
        const categories = await this.categoryService.getCategories();
        const budgets = await this.budgetService.getBudgets();

        const categoryNames = categories.map(c => c.name);
        const budgetMap = new Map(budgets.map(b => [b.attributes.name, b.id]));

        // Ask what to customize
        const toEdit = await this.userInputService.shouldEditCategoryBudget();

        if (toEdit.includes('category')) {
            const newCategory = await this.userInputService.getNewCategory(
                categoryNames,
                currentCategory
            );
            if (newCategory?.name) {
                result.categoryName = newCategory.name;
            }
        }

        if (toEdit.includes('budget')) {
            const budgetNames = Array.from(budgetMap.keys());
            const newBudget = await this.userInputService.getNewBudget(
                budgetNames,
                currentBudget
            );
            if (newBudget?.attributes.name) {
                result.budgetName = newBudget.attributes.name;
                result.budgetId = budgetMap.get(newBudget.attributes.name);
            }
        }

        return result;
    }
}
