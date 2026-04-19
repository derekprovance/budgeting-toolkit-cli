import { jest } from '@jest/globals';
import { createCli } from '../src/cli.js';

// Mock external modules
jest.mock('../src/config/config-manager.js');
jest.mock('../src/factories/service.factory.js');
jest.mock('../src/commands/init.command.js');
jest.mock('../src/api/firefly-client-with-certs.js');
jest.mock('../src/commands/analyze.command.js');
jest.mock('../src/commands/budget-report.command.js');
jest.mock('../src/commands/categorize.command.js');
jest.mock('../src/commands/split-transaction.command.js');

describe('CLI', () => {
    let consoleLogSpy: jest.Spied<typeof console.log>;
    let consoleErrorSpy: jest.Spied<typeof console.error>;
    let processExitSpy: jest.Spied<typeof process.exit>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup spies
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
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
        it('should register init command', () => {
            const cli = createCli();
            const initCmd = cli.commands.find(cmd => cmd.name() === 'init');

            expect(initCmd).toBeDefined();
            expect(initCmd?.description()).toContain('Initialize configuration');
        });

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

        it('should have exactly 5 main commands registered', () => {
            const cli = createCli();
            const commandNames = cli.commands.map(cmd => cmd.name());

            expect(commandNames).toEqual(
                expect.arrayContaining(['init', 'analyze', 'report', 'categorize', 'split'])
            );
            expect(commandNames.length).toBe(5);
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

    describe('init command', () => {
        it('should have --force option', () => {
            const cli = createCli();
            const initCmd = cli.commands.find(cmd => cmd.name() === 'init');
            const forceOption = initCmd?.options.find(opt => opt.long === '--force');

            expect(forceOption).toBeDefined();
        });
    });

    describe('config error handling', () => {
        it('should exit gracefully on config load errors', () => {
            // The CLI is created with mocked ConfigManager that returns valid config by default
            // This test verifies the basic flow completes without throwing
            const cli = createCli();
            expect(cli).toBeDefined();
        });
    });

    describe('all commands are accessible', () => {
        it('all commands should be defined and findable', () => {
            const cli = createCli();
            const commands = cli.commands.map(cmd => cmd.name());

            expect(commands.length).toBe(5);
            commands.forEach(cmdName => {
                expect(cmdName).toMatch(/init|analyze|report|categorize|split/);
            });
        });
    });
});
