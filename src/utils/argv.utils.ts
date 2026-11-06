/**
 * Pre-scans argv before Commander parses it, since services are wired from
 * configuration before the CLI is constructed. Handles every form Commander
 * accepts: `--config <path>`, `-c <path>`, `--config=<path>`, `-c=<path>`.
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
