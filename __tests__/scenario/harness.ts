/**
 * Shared wiring for the in-process scenario tests (not a test file itself).
 *
 * A real FireflyClientWithCerts talks to the fake Firefly server, so the SDK,
 * axios and fetchAllPages all run for real. Everything under src/ is imported
 * DYNAMICALLY, after BTK_PAGE_SIZE and TZ are set: pagination.utils resolves
 * its page size once, at module load.
 */
import { jest } from '@jest/globals';
import type { AppConfig } from '../../src/config/config.types.js';
import type { AnalyzeReportJson, BudgetReportJson } from '../../src/types/dto/report-json.types.js';
import { FakeFirefly } from '../../test-harness/fake-firefly/server.js';
import { stripAnsi } from '../../test-harness/parse/text-output.js';
import { buildScenarioConfig } from '../../test-harness/scenario/config.js';
import { CONTRACT_PAGE_LIMIT } from '../../test-harness/scenario/firefly-contract.js';
import type { IdMap } from '../../test-harness/scenario/types.js';

/** Small enough that January (33 groups) spans several pages */
export const SCENARIO_PAGE_SIZE = CONTRACT_PAGE_LIMIT;

export const SCENARIO_TOKEN = 'scenario-token';

/**
 * The AppConfig the in-process tests inject: code defaults, the scenario's
 * config.yaml keys, and the Firefly URL/token. config-roundtrip.test.ts proves
 * loading the same YAML through ConfigManager yields exactly this.
 */
export function buildInProcessConfig(
    defaults: AppConfig,
    idMap: Pick<IdMap, 'accounts'>,
    firefly: { url: string; token: string }
): AppConfig {
    const yaml = buildScenarioConfig(idMap);
    const config = structuredClone(defaults);
    config.api.firefly.url = firefly.url;
    config.api.firefly.token = firefly.token;
    config.accounts.untrackedAccounts = yaml.untrackedAccounts;
    config.transactions.expectedMonthlyPaycheck = yaml.expectedMonthlyPaycheck;
    config.transactions.excludedTransactions =
        yaml.excludedTransactions as AppConfig['transactions']['excludedTransactions'];
    return config;
}

export interface Scenario {
    fake: FakeFirefly;
    idMap: IdMap;
    config: AppConfig;
    pageSize: number;
    runAnalyze(month: number, year: number): Promise<{ json: AnalyzeReportJson; text: string }>;
    runReport(month: number, year: number): Promise<{ json: BudgetReportJson; text: string }>;
    stop(): Promise<void>;
}

/** Runs `fn` with console.log captured; returns everything it printed */
async function capture(fn: () => Promise<unknown>): Promise<string> {
    const lines: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        lines.push(args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
    });
    try {
        await fn();
    } finally {
        spy.mockRestore();
    }
    return lines.join('\n');
}

/** Starts the fake, seeds the scenario and wires the real commands */
export async function startScenario(): Promise<Scenario> {
    process.env.BTK_PAGE_SIZE = String(SCENARIO_PAGE_SIZE);
    process.env.TZ = 'UTC';

    const [
        { FireflyClientWithCerts },
        { ServiceFactory },
        commands,
        { DEFAULT_CONFIG },
        pagination,
        { seedScenario },
    ] = await Promise.all([
        import('../../src/api/firefly-client-with-certs.js'),
        import('../../src/factories/service.factory.js'),
        import('../../src/factories/command.factory.js'),
        import('../../src/config/config.defaults.js'),
        import('../../src/utils/pagination.utils.js'),
        import('../../test-harness/seed/seed-scenario.js'),
    ]);

    if (pagination.PAGE_SIZE !== SCENARIO_PAGE_SIZE) {
        throw new Error(
            `pagination.utils was loaded before BTK_PAGE_SIZE was set (PAGE_SIZE=${pagination.PAGE_SIZE})`
        );
    }

    const fake = new FakeFirefly({ token: SCENARIO_TOKEN });
    await fake.start();

    const client = new FireflyClientWithCerts({ BASE: fake.apiBase, TOKEN: SCENARIO_TOKEN });
    const idMap = await seedScenario(client);
    const config = buildInProcessConfig(DEFAULT_CONFIG, idMap, {
        url: fake.url,
        token: SCENARIO_TOKEN,
    });

    // Fresh services per run, like a fresh CLI process: no cache carries over
    const services = () => ServiceFactory.createServices(client, config);

    const run = async <T>(
        make: (s: ReturnType<typeof services>) => {
            execute(p: { month: number; year: number; format: 'json' | 'text' }): Promise<unknown>;
        },
        month: number,
        year: number
    ): Promise<{ json: T; text: string }> => {
        const jsonOut = await capture(() =>
            make(services()).execute({ month, year, format: 'json' })
        );
        const textOut = await capture(() =>
            make(services()).execute({ month, year, format: 'text' })
        );
        return { json: JSON.parse(jsonOut) as T, text: stripAnsi(textOut) };
    };

    return {
        fake,
        idMap,
        config,
        pageSize: pagination.PAGE_SIZE,
        runAnalyze: (month, year) =>
            run<AnalyzeReportJson>(s => commands.createAnalyzeCommand(s, config), month, year),
        runReport: (month, year) =>
            run<BudgetReportJson>(s => commands.createBudgetReportCommand(s), month, year),
        stop: () => fake.stop(),
    };
}
