import chalk from 'chalk';
import { UpdateTransactionMode } from '../../types/enum/update-transaction-mode.enum';

export class UpdateTransactionDisplayService {
    /**
     * Formats the processing header
     */
    formatProcessingHeader(
        tag: string,
        updateMode: UpdateTransactionMode,
        dryRun?: boolean
    ): string {
        const modeText =
            updateMode === UpdateTransactionMode.Both
                ? 'categories and budgets'
                : updateMode === UpdateTransactionMode.Category
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
        return ['\n', chalk.yellow(`❌ Tag "${tag}" not found`)].join('\n');
    }

    /**
     * Formats the empty tag message
     */
    formatEmptyTag(tag: string): string {
        return ['\n', chalk.yellow(`No processable transactions found with tag "${tag}"`)].join(
            '\n'
        );
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
