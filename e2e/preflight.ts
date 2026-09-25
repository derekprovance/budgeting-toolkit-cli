/**
 * e2e pre-flight, run by global-setup.ts under tsx: refuse to run unless the
 * seeded, local btk-e2e Firefly is the only thing this suite can reach.
 * Exits non-zero with a reason on any failure.
 */
import fs from 'node:fs';
import * as yaml from 'js-yaml';
import { buildScenarioConfig } from '../test-harness/scenario/config.js';
import { markerTag } from '../test-harness/scenario/hash.js';
import {
    CONFIG_PATH,
    E2E_EMAIL,
    ENV_PATH,
    ID_MAP_PATH,
    STATE_PATH,
    api,
    assertEnvFileIsLocal,
    readIdMap,
} from './helpers/e2e-env.js';

const HINT = 'Run the suite through `npm run test:e2e` (or `npm run e2e:up && npm run e2e:seed`).';

async function preflight(): Promise<void> {
    for (const file of [ENV_PATH, STATE_PATH, ID_MAP_PATH, CONFIG_PATH]) {
        if (!fs.existsSync(file)) {
            throw new Error(`e2e artifact missing: ${file}. ${HINT}`);
        }
    }

    const { url } = assertEnvFileIsLocal();

    const health = await fetch(`${url}/health`);
    if (health.status !== 200) {
        throw new Error(`${url}/health → ${health.status}. ${HINT}`);
    }

    const user = await api('/v1/about/user');
    const email = (user.body as { data?: { attributes?: { email?: string } } })?.data?.attributes
        ?.email;
    if (user.status !== 200 || email !== E2E_EMAIL) {
        throw new Error(
            `token does not authenticate as ${E2E_EMAIL} (status ${user.status}, ${email})`
        );
    }

    const tags = await api('/v1/tags?limit=500');
    const names = ((tags.body as { data?: { attributes: { tag: string } }[] }).data ?? []).map(
        t => t.attributes.tag
    );
    if (!names.includes(markerTag())) {
        throw new Error(
            `seed marker ${markerTag()} not found (tags: ${names.join(', ')}); the database was not ` +
                `seeded from the current scenario. ${HINT}`
        );
    }

    // The config the CLI reads must be exactly the scenario's
    const onDisk = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const expected = JSON.parse(JSON.stringify(buildScenarioConfig(readIdMap())));
    if (JSON.stringify(onDisk) !== JSON.stringify(expected)) {
        throw new Error(`${CONFIG_PATH} does not match buildScenarioConfig(id-map). ${HINT}`);
    }
}

preflight().catch(err => {
    process.stderr.write(`[e2e:preflight] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
});
