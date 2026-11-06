/**
 * The scenario's config.yaml, as a plain YAML-able object.
 *
 * Keys follow the top-level YAML shape ConfigManager reads (see
 * src/config/config-manager.ts `YamlConfig`), restated here because this
 * directory may not import from src/. `config-roundtrip.test.ts` loads the
 * output through the real ConfigManager, so a drift in key names fails there.
 */
import type { IdMap } from './types.js';

export interface ScenarioYamlExclusion {
    description?: string;
    amount?: string;
    reason?: string;
}

/** The subset of ConfigManager's YAML keys the scenario uses */
export interface ScenarioYamlConfig {
    expectedMonthlyPaycheck?: number;
    untrackedAccounts: string[];
    excludedTransactions: ScenarioYamlExclusion[];
    // Deliberately absent:
    // - tags: the defaults ('Paycheck', 'Disposable Income') are used.
}

/** Only the account ids are needed to build the config */
export type ConfigIdMap = Pick<IdMap, 'accounts'>;

export function buildScenarioConfig(idMap: ConfigIdMap): ScenarioYamlConfig {
    const a = idMap.accounts;
    return {
        expectedMonthlyPaycheck: 2100,
        // Everything outside the envelope (R-SCOPE-1); inactive OLD stays inside.
        untrackedAccounts: [a.SAV, a.BRK, a.POOL],
        excludedTransactions: [
            {
                description: 'Annual Membership Deposit',
                amount: '75.00',
                reason: 'refundable deposit',
            },
        ],
    };
}

export interface InvalidConfigCase {
    name: string;
    config: ScenarioYamlConfig;
    /** Command to run with it; config-level errors fail on any command */
    command: 'analyze' | 'report';
    /** Must appear in stderr (after stripAnsi) */
    expectedError: RegExp;
}

/**
 * Configs the CLI must refuse. Messages are those of ConfigValidator and
 * CommandConfigValidator; each must exit non-zero before touching Firefly
 * data.
 */
export function invalidConfigs(idMap: ConfigIdMap): InvalidConfigCase[] {
    const base = buildScenarioConfig(idMap);
    const { expectedMonthlyPaycheck: _omitted, ...withoutPaycheck } = base;
    void _omitted;

    return [
        {
            name: 'amount-only exclusion',
            config: { ...base, excludedTransactions: [{ amount: '75.00' }] },
            command: 'analyze',
            expectedError:
                /excludedTransactions\[0\]: 'description' is required \(amount-only exclusions are not supported\)/,
        },
        {
            name: 'malformed exclusion amount',
            config: {
                ...base,
                excludedTransactions: [{ description: 'Annual Membership Deposit', amount: 'abc' }],
            },
            command: 'analyze',
            expectedError: /excludedTransactions\[0\]\.amount must be a valid amount \(got: abc\)/,
        },
        {
            name: 'missing expectedMonthlyPaycheck',
            config: withoutPaycheck,
            command: 'analyze',
            expectedError: /expectedMonthlyPaycheck is required for analyze command/,
        },
    ];
}
