/**
 * Extracts the --config/-c flag value from raw argv before Commander parses it.
 *
 * The config path must be known before the CLI is constructed (services are
 * wired from configuration at startup), so this pre-scan handles all the forms
 * Commander accepts: `--config <path>`, `-c <path>`, `--config=<path>`, and
 * `-c=<path>`.
 *
 * @param argv Raw argument vector (typically process.argv)
 * @returns The config path, or undefined when no usable flag/value is present
 */
export function extractConfigPath(argv: string[]): string | undefined {
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--config' || arg === '-c') {
            const value = argv[i + 1];
            // A following flag is not a value
            if (value && !value.startsWith('-')) {
                return value;
            }
            return undefined;
        }

        if (arg.startsWith('--config=')) {
            return arg.slice('--config='.length) || undefined;
        }

        if (arg.startsWith('-c=')) {
            return arg.slice('-c='.length) || undefined;
        }
    }

    return undefined;
}
