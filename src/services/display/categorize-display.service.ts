import chalk from 'chalk';
import { CategorizeMode } from '../../types/enums.js';
import { isCertificateError } from '../../utils/error-detection.utils.js';
import { TransactionValidationError } from '../../types/result.type.js';

const MODE_TEXT: Record<CategorizeMode, string> = {
    [CategorizeMode.Both]: 'categories and budgets',
    [CategorizeMode.Category]: 'categories',
    [CategorizeMode.Budget]: 'budgets',
};

export class CategorizeDisplayService {
    /**
     * Formats the processing header
     */
    formatProcessingHeader(tag: string, updateMode: CategorizeMode, dryRun?: boolean): string {
        const modeText = MODE_TEXT[updateMode];
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

    /** Lists the transactions that failed validation or could not be updated */
    formatTransactionErrors(errors: TransactionValidationError[]): string {
        return [
            `\n⚠️  ${errors.length} transaction(s) failed validation:\n`,
            ...errors.flatMap(error => [
                `  • ${error.transactionDescription}`,
                `    ${error.userMessage}`,
                '',
            ]),
            'Please check your categories and budgets in Firefly III.',
        ].join('\n');
    }

    /**
     * Formats the error message
     */
    formatError(error: unknown): string {
        const message = error instanceof Error ? error.message : String(error);
        const lines = [
            '\n',
            chalk.red('❌ Error processing transactions:'),
            chalk.red('   ' + message),
        ];

        if (isCertificateError(error)) {
            lines.push('');
            lines.push(
                chalk.yellow(
                    '   This looks like a TLS/certificate error. Check your certificate settings:'
                )
            );
            lines.push(
                chalk.yellow(
                    '     CLIENT_CERT_PATH     - path to your client certificate (.p12 or .pem)'
                )
            );
            lines.push(
                chalk.yellow('     CLIENT_CERT_PASSWORD - password for the client certificate')
            );
            lines.push(
                chalk.yellow(
                    '     CLIENT_CERT_CA_PATH  - path to the CA certificate for chain validation'
                )
            );
            lines.push(
                chalk.yellow(
                    '   If using a self-signed certificate, ensure CLIENT_CERT_CA_PATH is set.'
                )
            );
        }

        return lines.join('\n');
    }
}
