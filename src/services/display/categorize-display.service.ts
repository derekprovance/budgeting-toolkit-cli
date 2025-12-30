import chalk from 'chalk';
import { CategorizeMode } from '../../types/enums.js';

export class CategorizeDisplayService {
    /**
     * Formats the processing header
     */
    formatProcessingHeader(tag: string, updateMode: CategorizeMode, dryRun?: boolean): string {
        const modeText =
            updateMode === CategorizeMode.Both
                ? 'categories and budgets'
                : updateMode === CategorizeMode.Category
                  ? 'categories'
                  : 'budgets';

        const dryRunText = dryRun ? ' (Dry Run)' : '';

        return [
            chalk.cyan(`Processing transactions with tag "${tag}" for ${modeText}${dryRunText}:`),
        ].join('\n');
    }

    /**
     * Formats the tag not found message
     */
    formatTagNotFound(tag: string): string {
        return [chalk.yellow(`\n❌ Tag "${tag}" not found`)].join('\n');
    }

    /**
     * Formats the empty tag message
     */
    formatEmptyTag(tag: string): string {
        return [chalk.yellow(`\nNo processable transactions found with tag "${tag}"`)].join('\n');
    }

    /**
     * Formats the error message
     */
    formatError(error: unknown): string {
        return [
            '\n',
            chalk.red('❌ Error processing transactions:'),
            chalk.red('   ' + (error instanceof Error ? error.message : String(error))),
        ].join('\n');
    }
}
