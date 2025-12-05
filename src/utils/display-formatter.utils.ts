import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { CurrencyUtils } from './currency.utils.js';

/**
 * Utility class for common display formatting operations across display services
 */
export class DisplayFormatterUtils {
    /**
     * Formats currency with symbol
     */
    static formatCurrency(amount: number, symbol: string): string {
        return CurrencyUtils.formatWithSymbol(Math.abs(amount), symbol);
    }

    /**
     * Creates a header box with box drawing characters
     * @param text Header text (may contain ANSI color codes)
     * @returns Formatted header with top, middle, and bottom borders
     */
    static createBoxHeader(text: string): string {
        const padding = 2;
        // Use stripAnsi to get the actual visible text length, excluding ANSI escape codes
        const textLength = stripAnsi(text).length;
        const totalLength = textLength + padding * 2;

        const topBorder = '╔' + '═'.repeat(totalLength) + '╗';
        const middleLine = '║' + ' '.repeat(padding) + text + ' '.repeat(padding) + '║';
        const bottomBorder = '╚' + '═'.repeat(totalLength) + '╝';

        return `\n${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
    }

    /**
     * Creates a section header with box drawing characters
     * @param title Section title
     * @param width Total width of the header (default: 45)
     * @returns Formatted section header with borders
     */
    static createSectionHeader(title: string, width: number = 45): string {
        const topBorder = '┌' + '─'.repeat(width) + '┐';
        const middleLine = '│ ' + chalk.bold(title) + ' '.repeat(width - title.length - 1) + '│';
        const bottomBorder = '└' + '─'.repeat(width) + '┘';

        return `${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
    }

    /**
     * Creates a horizontal line with specified character
     * @param char Character to repeat (default: '━')
     * @param width Line width (default: 60)
     * @returns Formatted horizontal line
     */
    static createHorizontalLine(char: string = '━', width: number = 60): string {
        return chalk.dim(char.repeat(width));
    }

    /**
     * Formats a financial value with accounting-style display.
     * Shows sign based on impact to net position.
     *
     * @param amount The amount to format (can be positive or negative)
     * @param symbol Currency symbol
     * @param positiveIsGood Whether positive values are good (default: true)
     * @returns Formatted string with sign, color, and icon
     */
    static formatNetImpact(amount: number, symbol: string, positiveIsGood: boolean = true): string {
        const absFormatted = CurrencyUtils.formatWithSymbol(Math.abs(amount), symbol);

        if (amount === 0) {
            return chalk.white(`${absFormatted} ○`);
        }

        const isGood = positiveIsGood ? amount > 0 : amount < 0;
        const sign = amount > 0 ? '+' : '-';

        if (isGood) {
            return chalk.green(`${sign}${absFormatted} ✓`);
        } else {
            return chalk.red(`${sign}${absFormatted} ⚠`);
        }
    }

    /**
     * Gets appropriate status icon based on amount
     * @param amount The amount to evaluate
     * @param positiveIsGood Whether positive values are good
     * @returns Colored status icon
     */
    static getStatusIcon(amount: number, positiveIsGood: boolean): string {
        if (amount === 0) return '○';
        if (positiveIsGood) {
            return amount > 0 ? chalk.green('✓') : chalk.red('⚠');
        } else {
            return amount < 0 ? chalk.green('✓') : chalk.red('⚠');
        }
    }
}
