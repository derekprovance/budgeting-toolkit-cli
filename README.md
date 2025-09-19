# Firefly III CLI with Claude Integration

A powerful command-line interface (CLI) for interacting with both the Firefly III Personal Finance Manager API and Claude AI for intelligent financial analysis. This CLI allows you to perform various budget-related operations with AI-enhanced capabilities.

## Features

- ✨ Secure authentication using client certificates and API tokens
- 🤖 Intelligent financial analysis powered by Claude AI
- 🔄 Batch processing support for multiple operations
- 🛠 Configurable retry mechanisms and concurrent request handling
- 📦 Extensible architecture for adding more commands

## Getting Started

### Prerequisites

- Node.js (v23.x or later)
- npm (v10.x or later)
- A Firefly III instance with API access
- An Anthropic API key for Claude integration
- (Optional) Client certificate, key, and CA certificate for Firefly III authentication

### Installation

1. Clone the repository:

    ```bash
    git clone https://github.com/derekprovance/firefly-iii-cli.git
    cd firefly-iii-cli
    ```

2. Install dependencies:

    ```bash
    npm install
    ```

3. Configure your environment:
    ```bash
    cp .env.example .env
    ```

## Configuration

### Environment Setup (.env)

Create a `.env` file in the project root for **secrets and infrastructure settings**:

```bash
# Firefly III API Configuration
FIREFLY_API_URL=https://your-firefly-instance.com
FIREFLY_API_TOKEN=your_api_token_here

# Client Certificate Configuration (Optional)
CLIENT_CERT_CA_PATH=../certs/ca.pem
CLIENT_CERT_PATH=../certs/client.p12
CLIENT_CERT_PASSWORD=your_certificate_password

# AI Service Configuration
ANTHROPIC_API_KEY=your_anthropic_key

# Application Configuration
LOG_LEVEL=info
```

#### Required Environment Variables

| Variable            | Description                  | Required | Default |
| ------------------- | ---------------------------- | -------- | ------- |
| `FIREFLY_API_URL`   | Firefly III API endpoint URL | Yes      | -       |
| `FIREFLY_API_TOKEN` | Personal access token        | Yes      | -       |
| `ANTHROPIC_API_KEY` | Claude AI API key            | Yes\*    | -       |
| `LOG_LEVEL`         | Application logging level    | No       | info    |

\*Required for AI categorization features

**Note:** LLM model and performance settings are configured in the YAML file for easier tuning.

#### Certificate Variables (Optional)

| Variable               | Description             | File Type |
| ---------------------- | ----------------------- | --------- |
| `CLIENT_CERT_CA_PATH`  | CA certificate path     | .pem      |
| `CLIENT_CERT_PATH`     | Client certificate path | .p12      |
| `CLIENT_CERT_PASSWORD` | Certificate password    | -         |

### YAML Configuration

Create a `budgeting-toolkit.config.yaml` file for advanced configuration options:

```yaml
# Budget Configuration
expectedMonthlyPaycheck: 5000.00
validDestinationAccounts:
    - "Checking Account"
    - "Savings Account"
validExpenseAccounts:
    - "Credit Card"
excludedDescriptions:
    - "PAYROLL"
    - "ATM FEE"
excludeDisposableIncome: false
minTransactionAmount: 1.00
moneyMarketAccount: "Money Market"
monthlyBudget: 4500.00
additionalSavingsPercentage: 10

# LLM Configuration
llm:
    maxTokens: 1000
    batchSize: 10
    maxConcurrent: 3
    temperature: 0.2
    model: "claude-3-5-haiku-latest"
    retryDelayMs: 1000
    maxRetryDelayMs: 32000

    # Rate Limiting
    rateLimit:
        maxTokensPerMinute: 50
        refillInterval: 60000

    # Circuit Breaker
    circuitBreaker:
        failureThreshold: 5
        resetTimeout: 60000
        halfOpenTimeout: 30000
```

#### LLM Configuration Options

| Option            | Description                 | Default                 | Type   |
| ----------------- | --------------------------- | ----------------------- | ------ |
| `maxTokens`       | Maximum tokens per response | 1000                    | number |
| `batchSize`       | Transactions per batch      | 10                      | number |
| `maxConcurrent`   | Concurrent API requests     | 3                       | number |
| `temperature`     | Response randomness (0-1)   | 0.2                     | number |
| `model`           | Claude model version        | claude-3-5-haiku-latest | string |
| `retryDelayMs`    | Initial retry delay         | 1000                    | number |
| `maxRetryDelayMs` | Maximum retry delay         | 32000                   | number |

#### Rate Limiting Options

| Option               | Description                | Default | Type   |
| -------------------- | -------------------------- | ------- | ------ |
| `maxTokensPerMinute` | Rate limit threshold       | 50      | number |
| `refillInterval`     | Token refill interval (ms) | 60000   | number |

#### Circuit Breaker Options

| Option             | Description             | Default | Type   |
| ------------------ | ----------------------- | ------- | ------ |
| `failureThreshold` | Failures before opening | 5       | number |
| `resetTimeout`     | Reset timeout (ms)      | 60000   | number |
| `halfOpenTimeout`  | Half-open timeout (ms)  | 30000   | number |

### Transaction Exclusions

Create `excluded_transactions.csv` to specify transactions to exclude from processing:

```csv
Description,Amount
"Monthly Rent",1200.00
"Coffee Shop",
,50.00
"Grocery Store",125.50
```

#### Format Rules

- Two columns: Description (optional) and Amount (optional)
- At least one field required per row
- Amounts in decimal format (e.g., 125.50)
- Case-sensitive descriptions
- Both fields must match when both provided

### Performance & Reliability Features

The CLI includes several advanced features for production use:

#### Batch Processing

- **80-90% reduction** in API calls by processing multiple transactions per request
- Configurable batch sizes (default: 10 transactions)
- Automatic batching with order preservation

#### Rate Limiting

- Token bucket algorithm for API rate limiting
- Configurable requests per minute
- Automatic backpressure handling

#### Circuit Breaker

- Automatic failure detection and recovery
- Configurable failure thresholds
- Half-open state for gradual recovery

#### Performance Monitoring

- Real-time metrics tracking
- Cost estimation for API usage
- Response time monitoring
- Success/failure rate tracking

#### Error Handling

- Exponential backoff with jitter
- Configurable retry policies
- Graceful degradation on failures

## Usage

### Quick Start

Run the CLI using either method:

```bash
# Development mode (requires compilation)
npm start -- [command] [options]

# Production mode (compile first)
npm run compile
./budget.sh [command] [options]
```

### Global Options

Available for all commands:

```bash
-v, --verbose    Enable detailed logging
-q, --quiet      Suppress all output except errors
-h, --help       Display help information
--version        Show version number
```

### Commands

#### 🔍 Budget Status

View current budget status and spending analysis:

```bash
# Current month status
budgeting-toolkit status

# Specific month
budgeting-toolkit status --month 8

# Different year
budgeting-toolkit status --month 12 --year 2024

# Using alias
budgeting-toolkit st
```

**Options:**

- `-m, --month <1-12>` - Target month (default: current month)
- `-y, --year <year>` - Target year (default: current year)

#### 📊 Budget Finalization

Calculate budget finalization report with surplus/deficit analysis:

```bash
# Current month finalization
budgeting-toolkit finalize

# Specific month and year
budgeting-toolkit finalize --month 6 --year 2024

# Using alias
budgeting-toolkit fin --month 3
```

**Options:**

- `-m, --month <1-12>` - Target month (default: current month)
- `-y, --year <year>` - Target year (default: current year)

#### 🤖 AI Transaction Categorization

Intelligent transaction categorization and budget assignment using Claude AI:

```bash
# Basic categorization (categories + budgets)
budgeting-toolkit categorize Import-2025-06-23

# Include already categorized transactions
budgeting-toolkit categorize Import-2025-06-23 --include-classified

# Preview changes without applying
budgeting-toolkit categorize Import-2025-06-23 --dry-run

# Auto-apply without confirmation
budgeting-toolkit categorize Import-2025-06-23 --yes

# Categories only
budgeting-toolkit categorize Import-2025-06-23 --mode category

# Budgets only
budgeting-toolkit categorize Import-2025-06-23 --mode budget

# Using alias with verbose logging
budgeting-toolkit cat Import-2025-06-23 --verbose
```

**Options:**

- `-m, --mode <type>` - What to update: `category`, `budget`, or `both` (default: both)
- `-i, --include-classified` - Process transactions that already have categories/budgets
- `-y, --yes` - Skip confirmation prompts and apply changes automatically
- `-n, --dry-run` - Preview proposed changes without applying them

**Prerequisites:**

- Requires `ANTHROPIC_API_KEY` environment variable for AI categorization
- Transactions must be tagged in Firefly III with the specified tag

### Advanced Usage

#### Verbose Logging

```bash
# See detailed processing information
budgeting-toolkit categorize Import-2025-06-23 --verbose

# Or set environment variable
LOG_LEVEL=debug budgeting-toolkit categorize Import-2025-06-23
```

#### Batch Processing

```bash
# Process multiple months
for month in {1..12}; do
  budgeting-toolkit status --month $month --year 2024
done
```

#### Configuration Testing

```bash
# Test AI categorization without changes
budgeting-toolkit categorize Import-2025-06-23 --dry-run --verbose

# Test with different modes
budgeting-toolkit categorize Import-2025-06-23 --mode category --dry-run
budgeting-toolkit categorize Import-2025-06-23 --mode budget --dry-run
```

### Common Workflows

#### Monthly Budget Review

```bash
# 1. Check current status
budgeting-toolkit status

# 2. Categorize new transactions
budgeting-toolkit categorize Import-$(date +%Y-%m-%d)

# 3. Review finalization
budgeting-toolkit finalize
```

#### Transaction Import & Processing

```bash
# 1. Import transactions to Firefly III (external process)
# 2. Tag imported transactions with current date
# 3. Categorize with AI
budgeting-toolkit categorize Import-$(date +%Y-%m-%d) --yes
```

## Development

1. Run tests:

    ```bash
    npm test
    ```

2. Build:

    ```bash
    npm run compile
    ```

3. Development mode:
    ```bash
    npm run start
    ```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -am 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

### Troubleshooting

Common issues:

- PAT permission errors: Verify token permissions
- Repository access: Check repository permissions
- NPM configuration: Verify `.npmrc` settings

### Contact

For questions or feedback, please [open an issue](https://github.com/derekprovance/firefly-iii-cli/issues) in the repository.

## Legal

### License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### Acknowledgements

- [Firefly III](https://www.firefly-iii.org/) - Personal finance manager
- [Anthropic Claude](https://www.anthropic.com/claude) - AI language model
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) - Official Anthropic TypeScript SDK
- [Commander.js](https://github.com/tj/commander.js/) - Node.js command-line interface
