# Budgeting Toolkit CLI

A command-line interface for Firefly III Personal Finance Manager with AI-powered transaction categorization using Claude.

## Features

- AI-powered transaction categorization and budgeting
- Budget finalization reports with surplus/deficit analysis
- Monthly budget reporting
- Interactive transaction splitting
- Secure API authentication
- Batch processing with rate limiting
- Docker development environment

## Prerequisites

- Node.js v24.x or later
- npm v10.x or later
- Firefly III instance with API access
- Anthropic API key (optional - required only for `categorize` command)

## Installation

```bash
# Clone repository
git clone https://github.com/derekprovance/budgeting-toolkit-cli.git
cd budgeting-toolkit-cli

# Install dependencies
npm install

# Configure environment
cp .env.example .env
cp budgeting-toolkit.config.yaml.example budgeting-toolkit.config.yaml
```

## Usage

### Development vs Production

```bash
# Production (compile first)
npm run compile
./budget.sh [command] [options]

# Development (no compilation needed)
npm start -- [command] [options]

# Development with dev config (no compilation needed)
npm start:dev -- [command] [options]
```

### Commands

#### Budget Report

View current budget status for a month:

```bash
# Current month
./budget.sh report

# Specific month/year
./budget.sh report -m 8 -y 2024

# List format
./budget.sh report -m 8 --list
```

**Configuration Requirements:**
- `firefly.noNameExpenseAccountId` - ID of Firefly's "(no name)" expense account (default: '5')
- `tags.*` - Custom tag names (optional, defaults: "Disposable Income", "Bills")

See [CONFIG.md](CONFIG.md) for detailed configuration.

**Options:**
- `-m, --month <1-12>` - Target month (default: current)
- `-y, --year <year>` - Target year (default: current)

#### Budget Finalization

Calculate surplus/deficit with additional income and unbudgeted expenses:

```bash
# Current month
./budget.sh finalize

# Specific month
./budget.sh finalize -m 6 -y 2024
```

**Configuration Requirements:**
- `expectedMonthlyPaycheck` - Required: Expected monthly paycheck amount
- `validDestinationAccounts` - Required: Account IDs for income deposits
- `validExpenseAccounts` - Required: Account IDs for expense tracking
- `excludedAdditionalIncomePatterns` - Recommended: Patterns to exclude (e.g., "PAYROLL")

See [CONFIG.md](CONFIG.md) for detailed configuration.

**Options:**
- `-m, --month <1-12>` - Target month (default: current)
- `-y, --year <year>` - Target year (default: current)

#### AI Transaction Categorization

Automatically categorize and budget transactions using Claude:

```bash
# Categorize transactions with tag
./budget.sh categorize Import-2025-06-23

# Preview without applying
./budget.sh categorize Import-2025-06-23 --dry-run

# Include already categorized
./budget.sh categorize Import-2025-06-23 --include-classified

# Categories only or budgets only
./budget.sh categorize Import-2025-06-23 --mode category
./budget.sh categorize Import-2025-06-23 --mode budget
```

**Configuration Requirements:**
- `ANTHROPIC_API_KEY` - Required: Environment variable in .env file
- `llm.*` - Optional: AI model settings (temperature, batch size, etc.)

See [CONFIG.md](CONFIG.md) for detailed AI configuration.

**Options:**
- `-m, --mode <type>` - Update `category`, `budget`, or `both` (default: both)
- `-i, --include-classified` - Include already categorized transactions
- `-n, --dry-run` - Preview changes without applying

**Prerequisites:** Transactions must be tagged in Firefly III with the specified tag.

#### Transaction Splitting

Split a transaction into two parts, either interactively or via command-line parameters:

```bash
# Fully interactive (prompts for amount and descriptions)
./budget.sh split 123

# Provide amount via CLI
./budget.sh split 123 --amount 50.00

# Provide everything, skip confirmation
./budget.sh split 123 -a 50.00 -d "- Groceries" -d "- Hardware" -y

# Development mode
npm start:dev -- split 123 -a 50.00 -d "- Me" -d "- Family"
```

**Configuration Requirements:**
- Minimal - only Firefly III API credentials required

**Options:**
- `-a, --amount <amount>` - Amount for first split (remainder goes to second)
- `-d, --descriptions <text...>` - Custom text to append to split descriptions (space-separated: first to split 1, second to split 2)
- `-y, --yes` - Skip confirmation prompt

**Behavior:**
- First split preserves category, budget, and tags from original
- Second split left uncategorized for manual assignment in Firefly III
- Omit parameters to use interactive prompts

### Global Options

Available for all commands:

```bash
-v, --verbose    Detailed logging
-h, --help       Display help
--version        Show version
```

### Advanced Examples

```bash
# Verbose logging
./budget.sh categorize Import-2025-06-23 --verbose
LOG_LEVEL=trace npm start:dev -- categorize Import-2025-06-23

# Test AI configuration
./budget.sh categorize Import-2025-06-23 --dry-run --verbose

# Import workflow
./budget.sh categorize Import-$(date +%Y-%m-%d)
```

## Configuration

The toolkit uses two configuration files:
- **`.env`** - API credentials and secrets
- **`budgeting-toolkit.config.yaml`** - Application settings

### Quick Start

**Minimum .env configuration:**
```bash
# Required for all commands
FIREFLY_API_URL=https://your-firefly-instance.com
FIREFLY_API_TOKEN=your_api_token_here

# Required only for categorize command
ANTHROPIC_API_KEY=your_anthropic_key

# Optional
LOG_LEVEL=info
```

**Minimum YAML configuration (budgeting-toolkit.config.yaml):**
```yaml
# Optional: Budget Settings (report command)
expectedMonthlyPaycheck: 5000.00
validDestinationAccounts:
    - '1'  # Your checking account ID
validExpenseAccounts:
    - '3'  # Your credit card account ID

firefly:
    noNameExpenseAccountId: '5'  # Default Firefly "(no name)" account

# Optional: AI settings (categorize command)
llm:
    model: 'claude-sonnet-4-5'
    temperature: 0.2
    batchSize: 10
```

### Comprehensive Documentation

For complete configuration options including:
- Advanced LLM settings (rate limiting, circuit breaker)
- Transaction exclusion rules
- Certificate authentication (mTLS)
- Custom tag names
- Transfer validation rules

**See [CONFIG.md](CONFIG.md) for detailed documentation.**

## Docker Development

See [DOCKER.md](DOCKER.md) for detailed Docker setup instructions.

Quick start:

```bash
# Setup
cp .env.example .env.dev
# Edit .env.dev with your settings

# Start services
docker compose up

# Access Firefly at http://localhost:8080
# Generate API token and add to .env.dev
```

## Development

```bash
# Run tests
npm test
npm run test:coverage
npm run test:watch

# Build
npm run compile

# Lint and format
npm run linter
```

## Contributing

See [CLAUDE.md](CLAUDE.md) for architecture and development guidance.

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -am 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## License

MIT License

## Acknowledgements

- [Firefly III](https://www.firefly-iii.org/) - Personal finance manager
- [Anthropic Claude](https://www.anthropic.com/claude) - AI language model
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) - TypeScript SDK
