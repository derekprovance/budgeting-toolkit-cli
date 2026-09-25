/**
 * Jest `setupFiles` entry: runs in every test file before any module is imported.
 *
 * - FORCE_COLOR=0 makes chalk emit plain text, so display tests assert on real
 *   output (through stripAnsi where hyperlinks or other escapes remain) instead
 *   of mocking chalk, which is impossible under native ESM anyway.
 * - LOG_LEVEL=silent keeps pino quiet; tests that care about logging inject a
 *   mock logger.
 * - BTK_STRICT_CONFIG=1 disables ConfigManager's implicit fallbacks
 *   (./.env, ~/.budget/.env, ./config.yaml, ~/.budget/config.yaml).
 * - HOME points at a temp directory, so nothing can ever read the developer's
 *   real ~/.budget credentials or config. The directory is created by
 *   ./global-setup.ts, which also sets HOME in the real process environment
 *   (this file only sees the sandbox's copy, which `os.homedir()` ignores).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.FORCE_COLOR = '0';
process.env.LOG_LEVEL = 'silent';
process.env.BTK_STRICT_CONFIG = '1';

let home = process.env.BTK_TEST_HOME;
if (!home) {
    // Running without globalSetup (e.g. a custom config): still never use the real HOME.
    home = path.join(os.tmpdir(), `btk-test-home-${process.pid}`);
    fs.mkdirSync(home, { recursive: true });
}
process.env.HOME = home;
process.env.USERPROFILE = home;
