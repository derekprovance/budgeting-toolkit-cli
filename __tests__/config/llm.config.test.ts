import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { LLMConfig } from '../../src/config/llm.config.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { ClaudeClient } from '../../src/api/claude.client.js';

describe('LLMConfig', () => {
    // LLMConfig reads the ConfigManager singleton, so give it an explicit,
    // throwaway env file and config rather than letting it discover one.
    let dir: string;
    let configPath: string;
    const previousEnvFile = process.env.ENV_FILE;

    beforeAll(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btk-llm-config-'));
        const envPath = path.join(dir, '.env');
        configPath = path.join(dir, 'config.yaml');
        fs.writeFileSync(
            envPath,
            'FIREFLY_API_URL=http://127.0.0.1:1/api\nFIREFLY_API_TOKEN=test-token\n'
        );
        fs.writeFileSync(configPath, 'expectedMonthlyPaycheck: 1000\n');
        process.env.ENV_FILE = envPath;
    });

    afterAll(() => {
        ConfigManager.resetInstance();
        if (previousEnvFile === undefined) delete process.env.ENV_FILE;
        else process.env.ENV_FILE = previousEnvFile;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    beforeEach(() => {
        ConfigManager.resetInstance();
        ConfigManager.getInstance(configPath);
    });

    describe('createClient', () => {
        it('should create ClaudeClient with API key and LLM config from ConfigManager', () => {
            const client = LLMConfig.createClient('test-api-key');

            expect(client).toBeInstanceOf(ClaudeClient);
        });

        it('should throw error when Claude API key is missing', () => {
            expect(() => LLMConfig.createClient('')).toThrow(
                /ANTHROPIC_API_KEY is required but not set/
            );
        });

        it('should return ClaudeClient instance when called successfully', () => {
            const client = LLMConfig.createClient('valid-api-key');

            expect(client).toBeDefined();
            expect(client).toBeInstanceOf(ClaudeClient);
        });
    });
});
