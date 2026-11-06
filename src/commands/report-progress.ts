import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { OutputFormat } from '../types/common.types.js';
import { Result } from '../types/result.type.js';

/**
 * The spinner and output shared by the report commands (`analyze`, `report`).
 *
 * In `json` format the spinner is silenced and stdout carries nothing but the
 * JSON document, so it stays parseable; errors and warnings still reach stderr.
 */
export class ReportProgress {
    private readonly spinner: Ora;
    private readonly isJson: boolean;

    /**
     * Starts the spinner.
     *
     * @param failText What the spinner shows when the report cannot be built
     */
    constructor(
        text: string,
        private readonly failText: string,
        format: OutputFormat
    ) {
        this.isJson = format === 'json';
        this.spinner = ora({ text, isSilent: this.isJson }).start();
    }

    /** Runs the report, failing the spinner if it throws while still spinning */
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
     * Unwraps a Result, printing the user-facing message and throwing on error.
     *
     * Stops the spinner FIRST. Ora renders to stderr on an interval and clears
     * its line each frame, so writing the error while it is still spinning can
     * see that line overwritten.
     */
    unwrap<T, E extends { message: string; userMessage: string }>(
        result: Result<T, E>,
        label: string
    ): T {
        if (!result.ok) {
            this.spinner.fail(this.failText);
            console.error(chalk.red(`${label}:`), chalk.red.bold(result.error.userMessage));
            throw new Error(result.error.message);
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

    /** Prints the JSON document or the text report, whichever the format asks for */
    print(toJson: () => unknown, toText: () => string): void {
        console.log(this.isJson ? JSON.stringify(toJson(), null, 2) : toText());
    }
}
