import path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import dotenv from 'dotenv';
import {
    AppConfig,
    CategorizeConfig,
    ExcludedTransaction,
    LLMConfig,
    TagsConfig,
} from './config.types.js';
import { DEFAULT_CONFIG } from './config.defaults.js';
import { ConfigValidationError, ConfigValidator } from './config.validator.js';
import { errorMessage } from '../utils/error-detection.utils.js';

interface YamlConfig {
    untrackedAccounts?: string[];
    expectedMonthlyPaycheck?: number;
    excludedTransactions?: ExcludedTransaction[];
    tags?: Partial<TagsConfig>;
    llm?: DeepPartial<LLMConfig>;
    categorize?: Partial<CategorizeConfig>;
}

/** Every key this loader understands. Anything else in the YAML is ignored. */
const KNOWN_YAML_KEYS: ReadonlySet<string> = new Set(
    Object.keys({
        untrackedAccounts: true,
        expectedMonthlyPaycheck: true,
        excludedTransactions: true,
        tags: true,
        llm: true,
        categorize: true,
    } satisfies Record<keyof YamlConfig, true>)
);

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

/** Precedence, high to low: config.yaml, environment (.env), config.defaults.ts. */
export class ConfigManager {
    private static instance: ConfigManager | undefined;
    private static configFilePath: string | null = null;
    /** The configPath passed on first initialization, for mismatch detection */
    private static initConfigPathArg: string | undefined;
    /** Resolved .env path, captured statically so it survives a validation throw */
    private static resolvedEnvPath: string | null = null;
    private config: AppConfig;

    private constructor(configPath?: string) {
        ConfigManager.configFilePath = ConfigManager.resolveConfigPath(configPath);

        ConfigManager.resolvedEnvPath = ConfigManager.findEnvFile();
        if (ConfigManager.resolvedEnvPath) {
            dotenv.config({ path: ConfigManager.resolvedEnvPath, quiet: true });
        }

        this.config = this.loadConfiguration();
        this.validateConfiguration();
    }

    /**
     * @param configPath Only honored on first initialization; a different path afterwards
     * throws, since silently using the wrong config for financial data is worse than an error.
     */
    static getInstance(configPath?: string): ConfigManager {
        if (ConfigManager.instance) {
            if (configPath !== undefined && configPath !== ConfigManager.initConfigPathArg) {
                throw new Error(
                    'ConfigManager already initialized with a different config path; ' +
                        '--config must be handled before first use'
                );
            }
            return ConfigManager.instance;
        }

        ConfigManager.initConfigPathArg = configPath;
        ConfigManager.instance = new ConfigManager(configPath);
        return ConfigManager.instance;
    }

    /** Populated even when the constructor throws on validation, so errors can name the files loaded. */
    static getResolvedPaths(): { configPath: string | null; envPath: string | null } {
        return {
            configPath: ConfigManager.configFilePath,
            envPath: ConfigManager.resolvedEnvPath,
        };
    }

    getConfig(): AppConfig {
        return this.config;
    }

    /** For tests only. */
    static resetInstance(): void {
        ConfigManager.instance = undefined;
        ConfigManager.configFilePath = null;
        ConfigManager.initConfigPathArg = undefined;
        ConfigManager.resolvedEnvPath = null;
    }

    static getDefaultConfigDir(): string {
        return path.join(os.homedir(), '.budget');
    }

    static getDefaultConfigPath(): string {
        return path.join(ConfigManager.getDefaultConfigDir(), 'config.yaml');
    }

    static getDefaultEnvPath(): string {
        return path.join(ConfigManager.getDefaultConfigDir(), '.env');
    }

    /**
     * `BTK_STRICT_CONFIG`: tests and e2e must never fall back to the developer's real
     * `./.env`, `~/.budget/.env`, `./config.yaml` or `~/.budget/config.yaml`, which point at a
     * live Firefly. Every file must be named explicitly, and a missing one is an error.
     */
    static isStrictMode(): boolean {
        const value = process.env.BTK_STRICT_CONFIG?.trim().toLowerCase();
        return value === '1' || value === 'true';
    }

    /** --config, then ./config.yaml, then ~/.budget/config.yaml; null means use defaults. */
    private static resolveConfigPath(customPath?: string): string | null {
        if (customPath) {
            const resolved = path.resolve(process.cwd(), customPath);

            if (fs.existsSync(resolved)) {
                return resolved;
            }

            throw new Error(`Config file not found: ${resolved}`);
        }

        if (ConfigManager.isStrictMode()) {
            throw new Error(
                'BTK_STRICT_CONFIG is set: pass the config file explicitly with --config <path>. ' +
                    'The ./config.yaml and ~/.budget/config.yaml fallbacks are disabled.'
            );
        }

        const cwdPath = path.join(process.cwd(), 'config.yaml');
        if (fs.existsSync(cwdPath)) {
            return cwdPath;
        }

        const homePath = ConfigManager.getDefaultConfigPath();
        if (fs.existsSync(homePath)) {
            return homePath;
        }

        console.warn(
            'No config.yaml found. Using defaults. Copy config.yaml.example to ~/.budget/config.yaml to create configuration.'
        );
        return null;
    }

    /**
     * ENV_FILE (returned even if it does not exist), then ./.env, then ~/.budget/.env.
     * In strict mode only ENV_FILE is consulted, and it must exist.
     */
    private static findEnvFile(): string | null {
        const envFile = process.env.ENV_FILE;

        if (ConfigManager.isStrictMode()) {
            if (!envFile) {
                throw new Error(
                    'BTK_STRICT_CONFIG is set: ENV_FILE must name the .env file to load. ' +
                        'The ./.env and ~/.budget/.env fallbacks are disabled.'
                );
            }
            const resolved = path.resolve(process.cwd(), envFile);
            if (!fs.existsSync(resolved)) {
                throw new Error(`BTK_STRICT_CONFIG is set: ENV_FILE not found: ${resolved}`);
            }
            return resolved;
        }

        if (envFile) {
            return envFile;
        }

        const candidates = [path.join(process.cwd(), '.env'), ConfigManager.getDefaultEnvPath()];
        return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
    }

    private loadConfiguration(): AppConfig {
        const config = structuredClone<AppConfig>(DEFAULT_CONFIG);
        this.applyEnvironmentVariables(config);
        this.applyYamlConfiguration(config);

        return config;
    }

    private applyEnvironmentVariables(config: AppConfig): void {
        if (process.env.FIREFLY_API_URL) {
            // A trailing slash would double up when paths are appended
            config.api.firefly.url = process.env.FIREFLY_API_URL.replace(/\/+$/, '');
        }

        if (process.env.FIREFLY_API_TOKEN) {
            config.api.firefly.token = process.env.FIREFLY_API_TOKEN;
        }

        if (process.env.CLIENT_CERT_PATH) {
            config.api.firefly.certificates = config.api.firefly.certificates || {};
            config.api.firefly.certificates.clientCertPath = path.resolve(
                process.cwd(),
                process.env.CLIENT_CERT_PATH
            );
        }

        if (process.env.CLIENT_CERT_CA_PATH) {
            config.api.firefly.certificates = config.api.firefly.certificates || {};
            config.api.firefly.certificates.caCertPath = path.resolve(
                process.cwd(),
                process.env.CLIENT_CERT_CA_PATH
            );
        }

        if (process.env.CLIENT_CERT_PASSWORD) {
            config.api.firefly.certificates = config.api.firefly.certificates || {};
            config.api.firefly.certificates.clientCertPassword = process.env.CLIENT_CERT_PASSWORD;
        }

        if (process.env.ANTHROPIC_API_KEY) {
            config.api.claude.apiKey = process.env.ANTHROPIC_API_KEY;
        }

        if (process.env.LOG_LEVEL) {
            config.logging.level = process.env.LOG_LEVEL as AppConfig['logging']['level'];
        }
    }

    /** So a typo is never silently taken as applied. */
    private warnOnUnknownYamlKeys(yamlConfig: YamlConfig): void {
        for (const key of Object.keys(yamlConfig)) {
            if (!KNOWN_YAML_KEYS.has(key)) {
                console.warn(`⚠️  config.yaml: unknown setting '${key}' is being ignored.`);
            }
        }
    }

    private applyYamlConfiguration(config: AppConfig): void {
        const yamlConfig = this.loadYamlFile();

        if (!yamlConfig) {
            return;
        }

        this.warnOnUnknownYamlKeys(yamlConfig);

        if (yamlConfig.untrackedAccounts) {
            // Firefly ids are strings; an unquoted `- 27` parses as a number and
            // would silently match nothing, putting savings back in the envelope
            config.accounts.untrackedAccounts = ([] as unknown[])
                .concat(yamlConfig.untrackedAccounts)
                .map(String);
        }

        if (yamlConfig.expectedMonthlyPaycheck != null) {
            config.transactions.expectedMonthlyPaycheck = yamlConfig.expectedMonthlyPaycheck;
        }
        if (yamlConfig.excludedTransactions) {
            // An unquoted `amount: 75.00` parses as a number
            // Left as-is when not a list, so ConfigValidator reports it by name
            config.transactions.excludedTransactions = Array.isArray(
                yamlConfig.excludedTransactions
            )
                ? yamlConfig.excludedTransactions.map(rule =>
                      rule.amount == null ? rule : { ...rule, amount: String(rule.amount) }
                  )
                : yamlConfig.excludedTransactions;
        }

        if (yamlConfig.tags) {
            this.deepMerge(config.transactions.tags, yamlConfig.tags);
        }
        if (yamlConfig.llm) {
            this.deepMerge(config.llm, yamlConfig.llm);
        }

        if (yamlConfig.categorize) {
            this.deepMerge(config.categorize, yamlConfig.categorize);
        }
    }

    private deepMerge<T extends object>(target: T, source: DeepPartial<T>): void {
        for (const [key, value] of Object.entries(source)) {
            // Empty YAML scalars parse to null — never let them clobber defaults
            if (value === undefined || value === null) {
                continue;
            }

            if (typeof value === 'object' && !Array.isArray(value)) {
                if (target[key as keyof T] && typeof target[key as keyof T] === 'object') {
                    this.deepMerge(
                        target[key as keyof T] as Record<string, unknown>,
                        value as DeepPartial<Record<string, unknown>>
                    );
                } else {
                    (target as Record<string, unknown>)[key] = value;
                }
            } else {
                (target as Record<string, unknown>)[key] = value;
            }
        }
    }

    private loadYamlFile(): YamlConfig | null {
        const configPath = ConfigManager.configFilePath;

        if (!configPath) {
            return null;
        }

        try {
            const fileContents = fs.readFileSync(configPath, 'utf8');
            return (yaml.load(fileContents) as YamlConfig) || null;
        } catch (error) {
            throw new Error(
                `Failed to parse YAML configuration at ${configPath}: ${errorMessage(error)}`,
                { cause: error }
            );
        }
    }

    /** Prints any warnings, then throws a ConfigValidationError on problems. */
    private validateConfiguration(): void {
        const report = new ConfigValidator().validate(this.config);

        if (report.warnings.length > 0) {
            console.warn('\n⚠️  Certificate Warnings:');
            report.warnings.forEach(warning => console.warn(`  ${warning}\n`));
        }

        if (report.problems.length > 0) {
            throw new ConfigValidationError(report);
        }
    }
}
