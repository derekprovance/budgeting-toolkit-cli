/**
 * The scenario's config.yaml, loaded through the real ConfigManager in strict
 * mode, must equal exactly the AppConfig the in-process tests inject. A drift
 * in YAML key names or value shapes fails here rather than silently making
 * the in-process layer test a config no user could write.
 */
import { afterEach, beforeEach, expect, test } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { ConfigManager } from '../../src/config/config-manager.js';
import { DEFAULT_CONFIG } from '../../src/config/config.defaults.js';
import { buildScenarioConfig } from '../../test-harness/scenario/config.js';
import type { IdMap } from '../../test-harness/scenario/types.js';
import { buildInProcessConfig } from './harness.js';

const URL = 'http://127.0.0.1:1';
const TOKEN = 'roundtrip-dummy-token';

// Any ids will do: the round-trip is about key names and shapes
const ACCOUNTS: IdMap['accounts'] = {
    CHK: '1',
    CC: '2',
    SAV: '3',
    BRK: '4',
    POOL: '5',
    OLD: '6',
};

let dir: string;
const savedEnv = { ...process.env };

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'btk-roundtrip-'));
    ConfigManager.resetInstance();
});

afterEach(() => {
    ConfigManager.resetInstance();
    for (const key of Object.keys(process.env)) {
        if (!(key in savedEnv)) delete process.env[key];
    }
    Object.assign(process.env, savedEnv);
    fs.rmSync(dir, { recursive: true, force: true });
});

test('scenario YAML loads through ConfigManager to the injected config', () => {
    const configPath = path.join(dir, 'config.yaml');
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(configPath, yaml.dump(buildScenarioConfig({ accounts: ACCOUNTS })));
    fs.writeFileSync(envPath, `FIREFLY_API_URL=${URL}\nFIREFLY_API_TOKEN=${TOKEN}\n`);

    delete process.env.FIREFLY_API_URL;
    delete process.env.FIREFLY_API_TOKEN;
    for (const key of [
        'ANTHROPIC_API_KEY',
        'CLIENT_CERT_PATH',
        'CLIENT_CERT_CA_PATH',
        'CLIENT_CERT_PASSWORD',
    ]) {
        delete process.env[key];
    }
    process.env.ENV_FILE = envPath;
    process.env.BTK_STRICT_CONFIG = '1';

    const loaded = ConfigManager.getInstance(configPath).getConfig();

    expect(loaded).toEqual(
        buildInProcessConfig(DEFAULT_CONFIG, { accounts: ACCOUNTS }, { url: URL, token: TOKEN })
    );
});
