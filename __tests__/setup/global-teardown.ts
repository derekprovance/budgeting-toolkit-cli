import fs from 'node:fs';

export default function globalTeardown(): void {
    const home = process.env.BTK_TEST_HOME;
    if (home && home.includes('btk-test-home-')) {
        fs.rmSync(home, { recursive: true, force: true });
    }
}
