/**
 * Jest `globalSetup`: runs once in the parent process, before workers spawn.
 *
 * `setupFiles` (./env.ts) only edits the test sandbox's copy of `process.env`,
 * which native calls such as `os.homedir()` never see. Setting HOME here
 * changes the real environment, which every worker inherits, so nothing in any
 * test can resolve the developer's real ~/.budget directory.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default function globalSetup(): void {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'btk-test-home-'));
    process.env.BTK_TEST_HOME = home;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    process.env.FORCE_COLOR = '0';
    process.env.LOG_LEVEL = 'silent';
    process.env.BTK_STRICT_CONFIG = '1';
}
