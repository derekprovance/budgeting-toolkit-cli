import { jest } from '@jest/globals';
import { DEFAULT_CONFIG } from '../src/config/config.defaults.js';
import type { AppConfig } from '../src/config/config.types.js';
import type { BudgetDateParams } from '../src/types/common.types.js';

/*
 * Native ESM: `jest.mock` is inert here (see __tests__/meta/esm-mocking.test.ts),
 * so the modules createCli wires at construction are replaced with
 * `unstable_mockModule` and cli.ts is imported dynamically afterwards. Without
 * this, createCli would construct the real ConfigManager and read the
 * developer's ./config.yaml and ~/.budget credentials.
 */
const testConfig: AppConfig = structuredClone(DEFAULT_CONFIG);
testConfig.transactions.expectedMonthlyPaycheck = 2000;

const mockGetInstance = jest.fn(() => ({ getConfig: () => testConfig }));
const mockGetResolvedPaths = jest.fn(() => ({ configPath: null, envPath: null }));

jest.unstable_mockModule('../src/config/config-manager.js', () => ({
    ConfigManager: {
        getInstance: mockGetInstance,
        getResolvedPaths: mockGetResolvedPaths,
    },
}));

const mockCreateServices = jest.fn<(client: unknown, config?: AppConfig) => object>(() => ({}));

jest.unstable_mockModule('../src/factories/service.factory.js', () => ({
    ServiceFactory: {
        createServices: mockCreateServices,
        createAITransactionUpdateOrchestrator: jest.fn(),
    },
}));

const mockAnalyzeExecute = jest.fn<(params: BudgetDateParams) => Promise<undefined>>(
    async () => undefined
);
const mockReportExecute = jest.fn<(params: BudgetDateParams) => Promise<undefined>>(
    async () => undefined
);
const mockCreateAnalyzeCommand = jest.fn(() => ({ execute: mockAnalyzeExecute }));
const mockCreateBudgetReportCommand = jest.fn(() => ({ execute: mockReportExecute }));

jest.unstable_mockModule('../src/factories/command.factory.js', () => ({
    createAnalyzeCommand: mockCreateAnalyzeCommand,
    createBudgetReportCommand: mockCreateBudgetReportCommand,
}));

const { createCli } = await import('../src/cli.js');
const { ConfigValidationError } = await import('../src/config/config.validator.js');

describe('CLI', () => {
    let consoleLogSpy: jest.Spied<typeof console.log>;
    let consoleErrorSpy: jest.Spied<typeof console.error>;
    let processExitSpy: jest.Spied<typeof process.exit>;

    beforeEach(() => {
        jest.clearAllMocks();

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw new Error('process.exit called');
        });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        processExitSpy.mockRestore();
    });

    describe('command registration', () => {
        it('should register analyze command', () => {
            const cli = createCli();
            const analyzeCmd = cli.commands.find(cmd => cmd.name() === 'analyze');

            expect(analyzeCmd).toBeDefined();
            expect(analyzeCmd?.aliases()).toContain('an');
        });

        it('should register report command', () => {
            const cli = createCli();
            const reportCmd = cli.commands.find(cmd => cmd.name() === 'report');

            expect(reportCmd).toBeDefined();
            expect(reportCmd?.aliases()).toContain('st');
        });

        it('should register categorize command', () => {
            const cli = createCli();
            const categorizeCmd = cli.commands.find(cmd => cmd.name() === 'categorize');

            expect(categorizeCmd).toBeDefined();
            expect(categorizeCmd?.aliases()).toContain('cat');
        });

        it('should register split command', () => {
            const cli = createCli();
            const splitCmd = cli.commands.find(cmd => cmd.name() === 'split');

            expect(splitCmd).toBeDefined();
            expect(splitCmd?.aliases()).toContain('sp');
        });

        it('should have exactly 4 main commands registered', () => {
            const cli = createCli();
            const commandNames = cli.commands.map(cmd => cmd.name());

            expect(commandNames).toEqual(
                expect.arrayContaining(['analyze', 'report', 'categorize', 'split'])
            );
            expect(commandNames.length).toBe(4);
        });
    });

    describe('CLI program options', () => {
        it('should have --verbose option', () => {
            const cli = createCli();
            const verboseOption = cli.options.find(opt => opt.long === '--verbose');

            expect(verboseOption).toBeDefined();
        });

        it('should have --config option', () => {
            const cli = createCli();
            const configOption = cli.options.find(opt => opt.long === '--config');

            expect(configOption).toBeDefined();
        });

        it('should have correct program name', () => {
            const cli = createCli();
            expect(cli.name()).toBe('budgeting-toolkit');
        });
    });

    describe('analyze command', () => {
        it('should have --month option', () => {
            const cli = createCli();
            const analyzeCmd = cli.commands.find(cmd => cmd.name() === 'analyze');
            const monthOption = analyzeCmd?.options.find(opt => opt.long === '--month');

            expect(monthOption).toBeDefined();
        });

        it('should have --year option', () => {
            const cli = createCli();
            const analyzeCmd = cli.commands.find(cmd => cmd.name() === 'analyze');
            const yearOption = analyzeCmd?.options.find(opt => opt.long === '--year');

            expect(yearOption).toBeDefined();
        });
    });

    describe('report command', () => {
        it('should have --month and --year options', () => {
            const cli = createCli();
            const reportCmd = cli.commands.find(cmd => cmd.name() === 'report');

            const monthOption = reportCmd?.options.find(opt => opt.long === '--month');
            const yearOption = reportCmd?.options.find(opt => opt.long === '--year');

            expect(monthOption).toBeDefined();
            expect(yearOption).toBeDefined();
        });
    });

    describe('categorize command', () => {
        it('should have --mode option', () => {
            const cli = createCli();
            const categorizeCmd = cli.commands.find(cmd => cmd.name() === 'categorize');
            const modeOption = categorizeCmd?.options.find(opt => opt.long === '--mode');

            expect(modeOption).toBeDefined();
        });

        it('should have --force option', () => {
            const cli = createCli();
            const categorizeCmd = cli.commands.find(cmd => cmd.name() === 'categorize');
            const forceOption = categorizeCmd?.options.find(opt => opt.long === '--force');

            expect(forceOption).toBeDefined();
        });

        it('should have --dry-run option', () => {
            const cli = createCli();
            const categorizeCmd = cli.commands.find(cmd => cmd.name() === 'categorize');
            const dryRunOption = categorizeCmd?.options.find(opt => opt.long === '--dry-run');

            expect(dryRunOption).toBeDefined();
        });
    });

    describe('split command', () => {
        it('should have --amount option', () => {
            const cli = createCli();
            const splitCmd = cli.commands.find(cmd => cmd.name() === 'split');
            const amountOption = splitCmd?.options.find(opt => opt.long === '--amount');

            expect(amountOption).toBeDefined();
        });

        it('should have --descriptions option', () => {
            const cli = createCli();
            const splitCmd = cli.commands.find(cmd => cmd.name() === 'split');
            const descriptionsOption = splitCmd?.options.find(opt => opt.long === '--descriptions');

            expect(descriptionsOption).toBeDefined();
        });

        it('should have --yes option', () => {
            const cli = createCli();
            const splitCmd = cli.commands.find(cmd => cmd.name() === 'split');
            const yesOption = splitCmd?.options.find(opt => opt.long === '--yes');

            expect(yesOption).toBeDefined();
        });
    });

    describe('config error handling', () => {
        it('should build services from the injected config', () => {
            const cli = createCli('/explicit/config.yaml');

            expect(cli).toBeDefined();
            expect(mockGetInstance).toHaveBeenCalledWith('/explicit/config.yaml');
            expect(mockCreateServices).toHaveBeenCalledWith(expect.anything(), testConfig);
        });

        it('should exit 1 when configuration cannot be loaded', () => {
            mockGetInstance.mockImplementationOnce(() => {
                throw new Error('BTK_STRICT_CONFIG is set: pass the config file explicitly');
            });

            expect(() => createCli()).toThrow('process.exit called');
            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to initialize API client:',
                expect.stringContaining('BTK_STRICT_CONFIG')
            );
        });

        it('should list every validation problem and the missing variables', () => {
            mockGetInstance.mockImplementationOnce(() => {
                throw new ConfigValidationError({
                    problems: [
                        'FIREFLY_API_TOKEN is required',
                        'CA certificate not found: /ca.pem\n  Suggestion: Verify the path',
                    ],
                    missingEnvVars: ['FIREFLY_API_TOKEN'],
                    warnings: [],
                });
            });

            expect(() => createCli()).toThrow('process.exit called');
            const printed = consoleErrorSpy.mock.calls.map(call => call.join(' ')).join('\n');

            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(printed).toContain('[!] Configuration validation failed');
            expect(printed).toContain('  config.yaml: (none found)');
            expect(printed).toContain(
                '  - CA certificate not found: /ca.pem\n  Suggestion: Verify the path'
            );
            expect(printed).toContain(
                'Set the missing environment variables in .env:\n  - FIREFLY_API_TOKEN'
            );
        });
    });

    describe('--json', () => {
        const argv = (...args: string[]) => ['node', 'btk', ...args];

        it.each(['analyze', 'report'])('should be offered by %s', name => {
            const cli = createCli();
            const cmd = cli.commands.find(c => c.name() === name);

            expect(cmd?.options.find(opt => opt.long === '--json')).toBeDefined();
        });

        it('should run analyze in json format when passed', async () => {
            const cli = createCli();
            await cli.parseAsync(argv('analyze', '-m', '1', '-y', '2025', '--json'));

            expect(mockCreateAnalyzeCommand).toHaveBeenCalledTimes(1);
            expect(mockAnalyzeExecute).toHaveBeenCalledWith({
                month: 1,
                year: 2025,
                verbose: false,
                format: 'json',
            });
        });

        it('should run analyze in text format by default', async () => {
            const cli = createCli();
            await cli.parseAsync(argv('analyze', '-m', '1', '-y', '2025'));

            expect(mockAnalyzeExecute).toHaveBeenCalledWith(
                expect.objectContaining({ format: 'text' })
            );
        });

        it('should run report in json format when passed', async () => {
            const cli = createCli();
            await cli.parseAsync(argv('report', '-m', '2', '-y', '2025', '--json'));

            expect(mockCreateBudgetReportCommand).toHaveBeenCalledTimes(1);
            expect(mockReportExecute).toHaveBeenCalledWith({
                month: 2,
                year: 2025,
                verbose: false,
                format: 'json',
            });
        });

        it('should exit 1 with the guidance when analyze has no expectedMonthlyPaycheck', async () => {
            testConfig.transactions.expectedMonthlyPaycheck = undefined;
            const cli = createCli();

            try {
                await expect(
                    cli.parseAsync(argv('analyze', '-m', '1', '-y', '2025'))
                ).rejects.toThrow('process.exit called');
            } finally {
                testConfig.transactions.expectedMonthlyPaycheck = 2000;
            }
            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(consoleErrorSpy.mock.calls).toEqual([
                ['\n❌ Configuration Error: analyze command\n'],
                [
                    'expectedMonthlyPaycheck is required for analyze command.\n' +
                        '  Add to config.yaml:\n' +
                        '    expectedMonthlyPaycheck: 5000.00\n',
                ],
                ['See CONFIG.md for detailed configuration documentation.'],
            ]);
            expect(mockAnalyzeExecute).not.toHaveBeenCalled();
        });

        it('should exit 1 with the guidance when categorize has no ANTHROPIC_API_KEY', async () => {
            const cli = createCli();

            await expect(cli.parseAsync(argv('categorize', 'Import-2025-06-23'))).rejects.toThrow(
                'process.exit called'
            );
            expect(processExitSpy).toHaveBeenCalledWith(1);
            expect(consoleErrorSpy.mock.calls).toEqual([
                ['\n❌ Configuration Error: categorize command\n'],
                [
                    'ANTHROPIC_API_KEY is required for categorize command.\n' +
                        '  Add to .env file:\n' +
                        '    ANTHROPIC_API_KEY=your_anthropic_key_here\n\n' +
                        '  Get your API key from: https://console.anthropic.com/\n',
                ],
                ['See CONFIG.md for detailed AI configuration.'],
            ]);
        });

        it('should still exit 1 when a json-mode command fails', async () => {
            mockAnalyzeExecute.mockRejectedValueOnce(new Error('boom'));
            const cli = createCli();

            await expect(
                cli.parseAsync(argv('analyze', '-m', '1', '-y', '2025', '--json'))
            ).rejects.toThrow('process.exit called');
            expect(processExitSpy).toHaveBeenCalledWith(1);
        });
    });

    describe('all commands are accessible', () => {
        it('all commands should be defined and findable', () => {
            const cli = createCli();
            const commands = cli.commands.map(cmd => cmd.name());

            expect(commands.length).toBe(4);
            commands.forEach(cmdName => {
                expect(cmdName).toMatch(/analyze|report|categorize|split/);
            });
        });
    });
});
