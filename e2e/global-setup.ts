/**
 * e2e globalSetup. Jest loads this file with Node's own type stripping (no
 * ts-jest transform, so `.js` specifiers would not resolve to the harness's
 * `.ts` sources); the checks therefore live in preflight.ts and run under tsx.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default function globalSetup(): void {
    const result = spawnSync(
        path.join(ROOT, 'node_modules', '.bin', 'tsx'),
        [path.join(ROOT, 'e2e', 'preflight.ts')],
        { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'], timeout: 30000 }
    );
    if (result.status !== 0) {
        throw new Error(
            `e2e pre-flight failed (exit ${result.status ?? result.signal}); see above`
        );
    }
}
