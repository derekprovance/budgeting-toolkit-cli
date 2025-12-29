# Budgeting Toolkit CLI

AI-powered command-line interface for Firefly III Personal Finance Manager with intelligent transaction categorization using Claude.

## Features

- AI-powered transaction categorization and budgeting
- Budget analysis with surplus/deficit tracking
- Interactive transaction splitting
- Docker development environment with Firefly III, and PostgreSQL

## Quick Start

### Prerequisites

- Node.js v24.x or later
- Firefly III instance with API access
- Anthropic API key (for `categorize` command only)

### Installation

```bash
# Clone and install
git clone https://github.com/derekprovance/budgeting-toolkit-cli.git
cd budgeting-toolkit-cli
npm install

# Interactive setup (recommended)
npm start -- init

# Or manual configuration
cp .env.example .env
cp config.yaml.example config.yaml
# Edit .env with your API credentials
```

### First Run

```bash
# Compile and run
npm run compile
./budget.sh categorize Import-2025-06-23

# Or development mode (no compilation)
npm start -- categorize Import-2025-06-23
```

See [Configuration](#configuration) below for setup details.

## Configuration

### Setup

Use the interactive `init` command to create configuration files (recommended):

```bash
npm start -- init
```

This creates configuration files in `~/.budgeting/` and guides you through setting API credentials.

Alternatively, manually set up configuration files:

```bash
cp .env.example ~/.budgeting/.env
cp config.yaml.example ~/.budgeting/config.yaml
# Edit both files with your settings
```

### Config File Search Locations

The application searches for configuration files in this priority order:

1. **CLI flag** (highest priority): `--config /path/to/config.yaml`
2. **Current directory**: `./config.yaml` and `./.env`
3. **Home directory** (recommended): `~/.budgeting/config.yaml` and `~/.budgeting/.env`
4. **Defaults**: Built-in defaults if no config file found

**Example:** Using a custom config path
```bash
./budget.sh --config /etc/budgeting/config.yaml categorize Import-2025-06-23
npm start -- --config ./custom-config.yaml categorize Import-2025-06-23
```

### Required Environment Variables

The `.env` file must contain your API credentials:

| Variable | Purpose | Required For | Default |
|----------|---------|--------------|---------|
| `FIREFLY_API_URL` | Firefly III API endpoint | All commands | - |
| `FIREFLY_API_TOKEN` | API authentication token | All commands | - |
| `ANTHROPIC_API_KEY` | Claude AI API key | `categorize` only | - |
| `LOG_LEVEL` | Logging verbosity | Optional | `info` |

### Optional YAML Configuration

`config.yaml` contains application settings. **All fields are optional** with sensible defaults defined in `src/config/config.defaults.ts`.

**Key defaults:**
- LLM model: `claude-sonnet-4-5`
- Temperature: `0.2`
- Batch size: `10`
- Tags: `Disposable Income`, `Paycheck`

See `config.yaml.example` for all available options or [CONFIG.md](CONFIG.md) for comprehensive documentation.

## Commands

| Command | Purpose | Example | Key Config |
|---------|---------|---------|------------|
| **`init`** | Interactive setup wizard for configuration | `npm start -- init` | - |
| **`categorize <tag>`** | AI-powered transaction categorization | `./budget.sh categorize Import-2025-06-23` | `ANTHROPIC_API_KEY` |
| `report` | Current budget status for a month | `./budget.sh report -m 8 -y 2024` | - |
| `analyze` | Budget surplus/deficit analysis | `./budget.sh analyze -m 6 -y 2024` | `expectedMonthlyPaycheck` |
| `split <id>` | Interactive transaction splitting | `./budget.sh split 123` | - |

### Init Command

Interactive setup wizard for creating configuration files:

```bash
# Run the setup wizard (guided walk-through)
npm start -- init

# Force overwrite existing files
npm start -- init --force
```

**Features:**
- Prompts for Firefly III API URL and token
- Prompts for Anthropic API key
- Creates configuration files in `~/.budgeting/`
- Validates input before saving
- Shows next steps after completion

**Options:**
- `--force` - Overwrite existing configuration files without asking

### Common Options

All commands support:
- `-m, --month <1-12>` - Target month (default: current)
- `-y, --year <year>` - Target year (default: current)
- `-v, --verbose` - Detailed logging
- `-h, --help` - Display help
- `--config <path>` - Custom config file path (priority over defaults)

### Categorize Command Options

The most popular command with additional options:

```bash
# Preview without applying changes
./budget.sh categorize Import-2025-06-23 --dry-run

# Include already categorized transactions
./budget.sh categorize Import-2025-06-23 --include-classified

# Update categories only or budgets only
./budget.sh categorize Import-2025-06-23 --mode category
./budget.sh categorize Import-2025-06-23 --mode budget

# Verbose logging for debugging
./budget.sh categorize Import-2025-06-23 --verbose
LOG_LEVEL=debug npm start -- categorize Import-2025-06-23
```

**Options:**
- `-m, --mode <type>` - Update `category`, `budget`, or `both` (default: `both`)
- `-i, --include-classified` - Include already categorized transactions
- `-n, --dry-run` - Preview changes without applying

**Note:** Transactions must be tagged in Firefly III with the specified tag.

### Split Command Options

```bash
# Fully interactive (prompts for amount and descriptions)
./budget.sh split 123

# Provide amount via CLI
./budget.sh split 123 --amount 50.00

# Skip confirmation
./budget.sh split 123 -a 50.00 -d "- Groceries" -d "- Hardware" -y
```

**Options:**
- `-a, --amount <amount>` - Amount for first split (remainder goes to second)
- `-d, --descriptions <text...>` - Custom text to append to split descriptions
- `-y, --yes` - Skip confirmation prompt

**Behavior:** First split preserves category, budget, and tags. Second split is left uncategorized for manual assignment in Firefly III.

## Running the CLI

```bash
# Production mode (compile first)
npm run compile
./budget.sh [command] [options]

# Development mode (no compilation needed)
npm start -- [command] [options]

# With development config
npm run start:dev -- [command] [options]

# Verbose logging
LOG_LEVEL=debug ./budget.sh categorize Import-2025-06-23
LOG_LEVEL=trace npm start -- categorize Import-2025-06-23
```

## Development

```bash
# Run tests
npm test
npm run test:coverage

# Lint and format
npm run linter
```

See [CLAUDE.md](CLAUDE.md) for architecture, patterns, and development guidelines.

## Docker

Full Docker development environment with Firefly III, and PostgreSQL included.

See [DOCKER.md](DOCKER.md) for complete setup instructions.

Quick start:
```bash
cp .env.example .env.dev
# Edit .env.dev with your settings
docker compose up
# Access Firefly at http://localhost:8080
```

## License

MIT License

## Acknowledgements

- [Firefly III](https://www.firefly-iii.org/) - Personal finance manager
- [Anthropic Claude](https://www.anthropic.com/claude) - AI language model
- [@anthropic-ai/sdk](https://github.com/anthropics/anthropic-sdk-typescript) - TypeScript SDK

---

**Need help?** Check [CONFIG.md](CONFIG.md) for configuration details or report issues at https://github.com/derekprovance/budgeting-toolkit-cli/issues
