import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import { CurrencyUtils } from './currency.utils.js';

export class DisplayFormatterUtils {
    /**
     * Pads to a visible width, ignoring ANSI escape codes: plain `padEnd`/`padStart`
     * count escape sequences as characters, so padding a colored string is a no-op.
     */
    static padVisible(text: string, width: number, side: 'start' | 'end' = 'end'): string {
        const visibleLength = stripAnsi(text).length;
        const padding = ' '.repeat(Math.max(0, width - visibleLength));
        return side === 'end' ? text + padding : padding + text;
    }

    static fitWidth(text: string, width: number): string {
        return text.substring(0, width).padEnd(width);
    }

    /** Locale is pinned so reports read identically on every machine. */
    static formatMonthYear(month: number, year: number): string {
        const monthName = new Intl.DateTimeFormat('en', { month: 'long' }).format(
            new Date(year, month - 1)
        );
        return `${monthName} ${year}`;
    }

    static isoDay(timestamp: string): string {
        return timestamp.split('T')[0];
    }

    /** Formatted in UTC to match Firefly's date handling. */
    static formatShortDate(date: Date): string {
        return new Intl.DateTimeFormat('en', {
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC',
        }).format(date);
    }

    static transactionUrl(baseUrl: string, transactionId: string): string {
        if (!baseUrl) return '';
        return `${baseUrl.replace(/\/+$/, '')}/transactions/show/${transactionId}`;
    }

    static createBoxHeader(text: string): string {
        const padding = 2;
        const textLength = stripAnsi(text).length;
        const totalLength = textLength + padding * 2;

        const topBorder = '╔' + '═'.repeat(totalLength) + '╗';
        const middleLine = '║' + ' '.repeat(padding) + text + ' '.repeat(padding) + '║';
        const bottomBorder = '╚' + '═'.repeat(totalLength) + '╝';

        return `\n${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
    }

    static createSectionHeader(title: string, width: number = 45): string {
        const topBorder = '┌' + '─'.repeat(width) + '┐';
        const titleLength = stripAnsi(title).length;
        const middleLine =
            '│ ' + chalk.bold(title) + ' '.repeat(Math.max(0, width - titleLength - 1)) + '│';
        const bottomBorder = '└' + '─'.repeat(width) + '┘';

        return `${chalk.cyan(topBorder)}\n${chalk.cyan(middleLine)}\n${chalk.cyan(bottomBorder)}`;
    }

    static createHorizontalLine(char: string = '━', width: number = 60): string {
        return chalk.dim(char.repeat(width));
    }

    static formatNetImpact(amount: number, symbol: string, positiveIsGood: boolean = true): string {
        // Signs and icons are decided on the displayed cents, so float noise
        // like -5e-15 never renders as "-$0.00 ⚠"
        const icon = DisplayFormatterUtils.getStatusIcon(amount, positiveIsGood);
        return `${DisplayFormatterUtils.formatSignedAmount(amount, symbol, positiveIsGood)} ${icon}`;
    }

    /** {@link formatNetImpact} without the status icon, for callers that place the icon themselves. */
    static formatSignedAmount(
        amount: number,
        symbol: string,
        positiveIsGood: boolean = true
    ): string {
        amount = CurrencyUtils.toCents(amount);
        const absFormatted = CurrencyUtils.formatWithSymbol(Math.abs(amount), symbol);

        if (amount === 0) {
            return chalk.white(absFormatted);
        }

        const isGood = positiveIsGood ? amount > 0 : amount < 0;
        const sign = amount > 0 ? '+' : '-';
        const color = isGood ? chalk.green : chalk.red;

        return color(`${sign}${absFormatted}`);
    }

    static getStatusIcon(amount: number, positiveIsGood: boolean): string {
        amount = CurrencyUtils.toCents(amount);
        if (amount === 0) return '○';
        if (positiveIsGood) {
            return amount > 0 ? chalk.green('✓') : chalk.red('⚠');
        } else {
            return amount < 0 ? chalk.green('✓') : chalk.red('⚠');
        }
    }

    /** Returns `text` unchanged when there is no transaction id to link to. */
    static linkedText(text: string, baseUrl: string, transactionId: string | undefined): string {
        if (!transactionId) return text;
        return DisplayFormatterUtils.createHyperlink(
            text,
            DisplayFormatterUtils.transactionUrl(baseUrl, transactionId)
        );
    }

    /** OSC 8 terminal hyperlink; plain text when there is no URL. */
    static createHyperlink(text: string, url?: string): string {
        if (!url) return text;
        return `\x1B]8;;${url}\x1B\\${text}\x1B]8;;\x1B\\`;
    }
}
