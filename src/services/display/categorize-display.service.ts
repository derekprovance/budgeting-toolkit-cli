import chalk from 'chalk';
import { CategorizeMode } from '../../types/enums.js';
import { isCertificateError } from '../../utils/error-detection.utils.js';

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
