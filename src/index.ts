#!/usr/bin/env node

import { createCli } from './cli.js';

// Extract --config flag value from argv before CLI parsing
const args = process.argv;
const configFlagIndex = args.findIndex(arg => arg === '--config' || arg === '-c');
const configPath =
    configFlagIndex !== -1 && args[configFlagIndex + 1] ? args[configFlagIndex + 1] : undefined;

// Create CLI with config path
const cli = createCli(configPath);
cli.parse(process.argv);
