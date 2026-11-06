import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { OutputFormat } from '../types/common.types.js';
import { Result } from '../types/result.type.js';
import { MonthError } from '../types/error/month.error.js';

/** In `json` format the spinner is silenced and stdout carries nothing but the JSON document. */
export class ReportProgress {
    private readonly spinner: Ora;
    private readonly isJson: boolean;

    /** Starts the spinner. */
    constructor(
        text: string,
        private readonly failText: string,
        format: OutputFormat
    ) {
        this.isJson = format === 'json';
        this.spinner = ora({ text, isSilent: this.isJson }).start();
    }

    async run<T>(buildReport: () => Promise<T>): Promise<T> {
        try {
            return await buildReport();
        } catch (error) {
            if (this.spinner.isSpinning) {
                this.spinner.fail(this.failText);
            }
            throw error;
        }
    }

    /**
     * @throws on an error Result, after printing its user-facing message. The spinner is
     * stopped first: ora clears its stderr line each frame and would overwrite the message.
     */
    unwrap<T>(result: Result<T, MonthError>, label: string): T {
        if (!result.ok) {
            this.spinner.fail(this.failText);
            console.error(chalk.red(`${label}:`), chalk.red.bold(result.error.userMessage));
            throw new Error(result.error.message, { cause: result.error.cause });
        }
        return result.value;
    }

    step(text: string): void {
        this.spinner.text = text;
    }

    /** Shows a non-fatal warning, on stderr even when the spinner is silent */
    warn(text: string): void {
        this.spinner.warn(text);
        if (this.isJson) {
            console.error(text);
        }
    }

    succeed(text: string): void {
        this.spinner.succeed(text);
    }

    print(toJson: () => unknown, toText: () => string): void {
        console.log(this.isJson ? JSON.stringify(toJson(), null, 2) : toText());
    }
}
