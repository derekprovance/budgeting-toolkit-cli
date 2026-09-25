/**
 * Spawns the real CLI (tsx src/index.ts) against the e2e Firefly.
 *
 * - cwd is a fresh temp directory, so no ./config.yaml or ./.env is found
 * - the env is built from scratch by buildChildEnv (no FIREFLY_* / ANTHROPIC_*
 *   inherited), with BTK_STRICT_CONFIG=1, ENV_FILE=.e2e/env, BTK_PAGE_SIZE=10
 * - the localhost guard is re-checked before every spawn, against whichever
 *   env file the child will actually load
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildChildEnv } from '../../test-harness/safety.js';
import { stripAnsi } from '../../test-harness/parse/text-output.js';
import { CONFIG_PATH, ENV_PATH, ROOT, assertEnvFileIsLocal } from './e2e-env.js';

const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const ENTRY = path.join(ROOT, 'src', 'index.ts');

export interface CliResult {
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    /** stdout + stderr, ANSI stripped */
    text: string;
}

export interface RunCliOptions {
    /** config.yaml path; `null` omits --config entirely. Default .e2e/config.yaml */
    config?: string | null;
    /** Extra/override env; an `undefined` value removes the key */
    env?: Record<string, string | undefined>;
    timeoutMs?: number;
}

export function tempDir(prefix = 'btk-e2e-'): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export async function runCli(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
    const env = buildChildEnv({
        ENV_FILE: ENV_PATH,
        BTK_PAGE_SIZE: '10',
        ...options.env,
    });

    // Guard: whatever env file the child loads must point at the local stack.
    // (With ENV_FILE removed, strict mode refuses before any request.)
    assertEnvFileIsLocal();
    if (env.ENV_FILE) {
        assertEnvFileIsLocal(env.ENV_FILE);
    }

    const config = options.config === undefined ? CONFIG_PATH : options.config;
    const argv = [ENTRY, ...(config === null ? [] : ['--config', config]), ...args];
    const cwd = tempDir('btk-e2e-cwd-');

    return new Promise((resolve, reject) => {
        const child = spawn(TSX, argv, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', d => (stdout += d));
        child.stderr.setEncoding('utf8').on('data', d => (stderr += d));
        const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs ?? 45000);
        child.on('error', err => {
            clearTimeout(timer);
            reject(err);
        });
        child.on('close', (code, signal) => {
            clearTimeout(timer);
            fs.rmSync(cwd, { recursive: true, force: true });
            resolve({ code, signal, stdout, stderr, text: stripAnsi(stdout + stderr) });
        });
    });
}

/** Runs a command that must exit 0; throws with its output otherwise */
export async function runCliOk(args: string[], options: RunCliOptions = {}): Promise<CliResult> {
    const result = await runCli(args, options);
    if (result.code !== 0) {
        throw new Error(
            `btk ${args.join(' ')} exited ${result.code ?? result.signal}\n` +
                `--- stdout\n${result.stdout}\n--- stderr\n${result.stderr}`
        );
    }
    return result;
}

/** Parses a --json run's stdout; the whole of stdout must be one JSON document */
export function parseJsonStdout<T>(result: CliResult): T {
    try {
        return JSON.parse(result.stdout) as T;
    } catch (err) {
        throw new Error(
            `stdout is not a single JSON document (${String(err)}):\n${result.stdout.slice(0, 2000)}`,
            { cause: err }
        );
    }
}
