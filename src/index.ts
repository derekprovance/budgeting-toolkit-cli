#!/usr/bin/env node

import { createCli } from './cli.js';
import { extractConfigPath } from './utils/argv.utils.js';
import { errorMessage } from './utils/error-detection.utils.js';

// Extract --config flag value from argv before CLI parsing
const configPath = extractConfigPath(process.argv);

// Create CLI with config path
const cli = createCli(configPath);
try {
    // All action handlers are async — parseAsync surfaces their rejections
    await cli.parseAsync(process.argv);
} catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
}
