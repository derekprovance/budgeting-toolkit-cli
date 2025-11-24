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
- Anthropic API key (for AI features)

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

## Configuration

### Environment Variables (.env)

Required for API access and secrets:

```bash
# Firefly III
FIREFLY_API_URL=https://your-firefly-instance.com
FIREFLY_API_TOKEN=your_api_token_here

# AI (required for categorization)
ANTHROPIC_API_KEY=your_anthropic_key

# Optional
LOG_LEVEL=info
CLIENT_CERT_CA_PATH=../certs/ca.pem
CLIENT_CERT_PATH=../certs/client.p12
CLIENT_CERT_PASSWORD=your_certificate_password
```

### YAML Configuration (budgeting-toolkit.config.yaml)

Application settings and preferences:

```yaml
# Budget settings
expectedMonthlyPaycheck: 5000.00
validDestinationAccounts:
    - '1'  # Checking
    - '2'  # Savings

validExpenseAccounts:
    - '4'  # Credit Card
    - '1'  # Checking

excludedAdditionalIncomePatterns:
    - PAYROLL
    - ATM FEE

excludeDisposableIncome: false

# Excluded transactions (globally exclude from all reports)
excludedTransactions:
    - description: 'STOCK INVESTMENT'
      amount: '100.00'
      reason: 'Investment purchase - not a regular expense'
    - description: 'TRANSFER TO SAVINGS'
      reason: 'Internal transfer, not an expense'
    - amount: '999.99'
      reason: 'Specific amount to exclude'

# Firefly settings
firefly:
    noNameExpenseAccountId: '5'

# AI settings
llm:
    model: 'claude-sonnet-4-5'
    maxTokens: 2000
    temperature: 0.1
    batchSize: 5
    maxConcurrent: 2
```

See `budgeting-toolkit.config.yaml.example` for complete configuration options.

### Transaction Exclusions

You can exclude specific transactions from all reports by adding them to the `excludedTransactions` section in your YAML config:

```yaml
excludedTransactions:
    # Match by description only (excludes any amount)
    - description: 'STOCK INVESTMENT'
      reason: 'Investment purchase'

    # Match by description and amount (exact match)
    - description: 'Monthly Rent'
      amount: '1200.00'
      reason: 'Rent payment'

    # Match by amount only (excludes any description)
    - amount: '999.99'
      reason: 'Specific amount to filter'
```

- At least one field (`description` or `amount`) is required
- `reason` is optional but recommended for documentation
- Description matching is case-insensitive and uses substring matching
- Amount matching is exact

## Usage

### Development vs Production

```bash
# Development (no compilation needed)
npm start -- [command] [options]

# Production (compile first)
npm run compile
./budget.sh [command] [options]
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
./budget.sh split 123 -a 50.00 -d1 "- Groceries" -d2 "- Hardware" -y

# Development mode
npm start -- split 123 -a 50.00 -d1 "- Me" -d2 "- Family"
```

**Options:**
- `-a, --amount <amount>` - Amount for first split (remainder goes to second)
- `-d1, --description1 <text>` - Custom text to append to first split description
- `-d2, --description2 <text>` - Custom text to append to second split description
- `-y, --yes` - Skip confirmation prompt

**Behavior:**
- First split preserves category, budget, and tags from original
- Second split left uncategorized for manual assignment in Firefly III
- Omit parameters to use interactive prompts

### Global Options

Available for all commands:

```bash
-v, --verbose    Detailed logging
-q, --quiet      Suppress non-error output
-h, --help       Display help
--version        Show version
```

### Advanced Examples

```bash
# Verbose logging
./budget.sh categorize Import-2025-06-23 --verbose
LOG_LEVEL=debug npm start -- categorize Import-2025-06-23

# Test AI configuration
./budget.sh categorize Import-2025-06-23 --dry-run --verbose

# Import workflow
./budget.sh categorize Import-$(date +%Y-%m-%d)
```

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
