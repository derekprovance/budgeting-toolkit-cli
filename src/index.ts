#!/usr/bin/env node

import { createCli } from './cli.js';
import { extractConfigPath } from './utils/argv.utils.js';
import { errorMessage } from './utils/error-detection.utils.js';

const configPath = extractConfigPath(process.argv);

const cli = createCli(configPath);
try {
    // parseAsync, not parse, surfaces the async action handlers' rejections
    await cli.parseAsync(process.argv);
} catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
}
