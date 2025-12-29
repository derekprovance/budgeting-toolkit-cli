import { Command } from '../types/interface/command.interface.js';
import { ConfigManager } from '../config/config-manager.js';
import { input, confirm } from '@inquirer/prompts';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Parameters for init command
 */
interface InitCommandParams {
    force?: boolean; // --force flag to overwrite existing files
}

/**
 * Command for initializing configuration files
 */
export class InitCommand implements Command<void, InitCommandParams> {
    private readonly CONFIG_DIR = ConfigManager.getDefaultConfigDir();
    private readonly CONFIG_PATH = ConfigManager.getDefaultConfigPath();
    private readonly ENV_PATH = ConfigManager.getDefaultEnvPath();

    // Template paths (resolved from package root)
    private readonly CONFIG_TEMPLATE_PATH: string;
    private readonly ENV_TEMPLATE_PATH: string;

    constructor() {
        // Resolve template paths from package root (dist/ folder parent)
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const packageRoot = path.resolve(__dirname, '../..');

        this.CONFIG_TEMPLATE_PATH = path.join(packageRoot, 'config.yaml.example');
        this.ENV_TEMPLATE_PATH = path.join(packageRoot, '.env.example');
    }

    async execute(params: InitCommandParams): Promise<void> {
        console.log(chalk.bold.cyan('\n!!!Budgeting Toolkit Configuration Setup!!!\n'));

        // Check if config directory exists and is actually a directory
        const dirExists = fs.existsSync(this.CONFIG_DIR);
        let isDirectory = true;

        if (dirExists) {
            const stats = fs.statSync(this.CONFIG_DIR);
            isDirectory = stats.isDirectory();

            if (!isDirectory) {
                throw new Error(
                    `Configuration path exists but is not a directory: ${this.CONFIG_DIR}\n` +
                        'Please remove or rename it and try again.'
                );
            }
        }

        // Check if config directory and files exist
        const configExists = fs.existsSync(this.CONFIG_PATH);
        const envExists = fs.existsSync(this.ENV_PATH);

        // Handle existing files
        if (!params.force && (configExists || envExists)) {
            const existing = [];
            if (configExists) existing.push('config.yaml');
            if (envExists) existing.push('.env');

            console.log(
                chalk.yellow(`[!] Configuration files already exist: ${existing.join(', ')}`)
            );
            console.log(chalk.gray(`   Location: ${this.CONFIG_DIR}\n`));

            const shouldOverwrite = await confirm({
                message: 'Overwrite existing configuration files?',
                default: false,
            });

            if (!shouldOverwrite) {
                console.log(chalk.yellow('\nSetup cancelled. Existing files were not modified.'));
                return;
            }
        }

        // Create directory if needed
        if (!dirExists || !isDirectory) {
            const spinner = ora('Creating configuration directory...').start();
            try {
                fs.mkdirSync(this.CONFIG_DIR, { recursive: true });
                spinner.succeed(`Created directory: ${chalk.cyan(this.CONFIG_DIR)}`);
            } catch (error) {
                spinner.fail('Failed to create directory');
                throw error;
            }
        }

        // Prompt for required values
        console.log(chalk.bold('[*] Enter required configuration values:\n'));

        const fireflyUrl = await input({
            message: 'Firefly III URL (e.g., https://firefly.example.com):',
            validate: (value: string) => {
                if (!value.trim()) return 'URL is required';
                if (!value.startsWith('http://') && !value.startsWith('https://')) {
                    return 'URL must start with http:// or https://';
                }
                return true;
            },
        });

        const fireflyToken = await input({
            message: 'Firefly III API Token:',
            validate: (value: string) => (value.trim() ? true : 'API Token is required'),
        });

        const anthropicKey = await input({
            message: 'Anthropic API Key (for AI categorization):',
            validate: (value: string) => (value.trim() ? true : 'API Key is required'),
        });

        // Generate config files
        const spinner = ora('Generating configuration files...').start();

        try {
            // Verify templates exist
            if (!fs.existsSync(this.ENV_TEMPLATE_PATH)) {
                throw new Error(`Environment template not found: ${this.ENV_TEMPLATE_PATH}`);
            }
            if (!fs.existsSync(this.CONFIG_TEMPLATE_PATH)) {
                throw new Error(`Config template not found: ${this.CONFIG_TEMPLATE_PATH}`);
            }

            // Generate .env file with user values
            await this.generateEnvFile(fireflyUrl, fireflyToken, anthropicKey);

            // Copy config.yaml template
            await this.generateConfigFile();

            spinner.succeed(chalk.green('Configuration files created successfully!'));
        } catch (error) {
            spinner.fail('Failed to generate configuration files');
            throw error;
        }

        // Display success message
        console.log(chalk.bold.green('\n[+] Setup Complete!\n'));
        console.log(chalk.cyan('Configuration files created at:'));
        console.log(chalk.gray(`  ${this.CONFIG_PATH}`));
        console.log(chalk.gray(`  ${this.ENV_PATH}\n`));

        console.log(chalk.yellow('Next steps:'));
        console.log(chalk.gray('  1. Edit config.yaml to configure account IDs and budgets'));
        console.log(chalk.gray('  2. Verify .env settings (API URLs and keys)'));
        console.log(chalk.gray('  3. Run "budgeting-toolkit --help" to see available commands\n'));
    }

    /**
     * Generates .env file with user-provided values
     */
    private async generateEnvFile(
        fireflyUrl: string,
        fireflyToken: string,
        anthropicKey: string
    ): Promise<void> {
        // Read template
        const template = fs.readFileSync(this.ENV_TEMPLATE_PATH, 'utf8');

        // Replace placeholders with actual values
        const content = template
            .replace(/FIREFLY_API_URL=.*/g, `FIREFLY_API_URL=${fireflyUrl}`)
            .replace(/FIREFLY_API_TOKEN=.*/g, `FIREFLY_API_TOKEN=${fireflyToken}`)
            .replace(/FIREFLY_III_ACCESS_TOKEN=.*/g, `FIREFLY_III_ACCESS_TOKEN=${fireflyToken}`)
            .replace(/ANTHROPIC_API_KEY=.*/g, `ANTHROPIC_API_KEY=${anthropicKey}`);

        fs.writeFileSync(this.ENV_PATH, content, 'utf8');
    }

    /**
     * Copies config.yaml template to config directory
     */
    private async generateConfigFile(): Promise<void> {
        const template = fs.readFileSync(this.CONFIG_TEMPLATE_PATH, 'utf8');
        fs.writeFileSync(this.CONFIG_PATH, template, 'utf8');
    }
}
