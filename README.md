# Budgeting Toolkit CLI

AI-powered command-line interface for Firefly III Personal Finance Manager with intelligent transaction categorization using Claude.

## Features

- AI-powered transaction categorization and budgeting
- Budget analysis with surplus/deficit tracking
- Interactive transaction splitting
- Docker development environment with Firefly III, and PostgreSQL

## Quick Start

### Prerequisites

- Node.js v26.x or later
- Firefly III instance with API access
- Anthropic API key (for `categorize` command only)

### Installation

```bash
# Clone and install
git clone https://github.com/derekprovance/budgeting-toolkit-cli.git
cd budgeting-toolkit-cli
npm install

# Configuration
cp .env.example .env
cp config.yaml.example config.yaml
# Edit .env with your API credentials
```

### First Run

```bash
# Development mode — no compilation step, runs from source
npm start -- categorize Import-2025-06-23

# Or install the `btk` binary globally, then use it anywhere
npm run dev:install
btk categorize Import-2025-06-23
```

`npm run compile` alone only writes `dist/`; it does not put `btk` on your PATH.
Use `npm run dev:install` for that, or invoke `node dist/index.js` directly.

See [Configuration](#configuration) below for setup details.

## Configuration

### Setup

Set up configuration files:

```bash
cp .env.example ~/.budget/.env
cp config.yaml.example ~/.budget/config.yaml
# Edit both files with your settings
```

### Config File Search Locations

The application searches for configuration files in this priority order:

1. **CLI flag** (highest priority): `--config /path/to/config.yaml`
2. **Current directory**: `./config.yaml` and `./.env`
3. **Home directory** (recommended): `~/.budget/config.yaml` and `~/.budget/.env`
4. **Defaults**: Built-in defaults if no config file found

**Example:** Using a custom config path
```bash
btk --config /etc/budgeting/config.yaml categorize Import-2025-06-23
npm start -- --config ./custom-config.yaml categorize Import-2025-06-23
```

### Required Environment Variables

The `.env` file must contain your API credentials:

| Variable | Purpose | Required For | Default |
|----------|---------|--------------|---------|
| `FIREFLY_API_URL` | Firefly III API endpoint | All commands | - |
| `FIREFLY_API_TOKEN` | API authentication token | All commands | - |
| `ANTHROPIC_API_KEY` | Claude AI API key | `categorize` only | - |
| `LOG_LEVEL` | Logging verbosity (`trace`…`error`, `silent`) | Optional | `silent` |

### Optional YAML Configuration

`config.yaml` contains application settings. **All fields are optional** with sensible defaults defined in `src/config/config.defaults.ts`.

**Key defaults:**
- LLM model: `claude-sonnet-5`
- Max tokens: `16000`
- Batch size: `10`
- Tags: `Disposable Income`, `Paycheck`

See `config.yaml.example` for all available options or [CONFIG.md](CONFIG.md) for comprehensive documentation.

## Commands

| Command | Alias | Purpose | Example | Key Config |
|---------|-------|---------|---------|------------|
| **`categorize <tag>`** | `cat` | AI-powered transaction categorization | `btk categorize Import-2025-06-23` | `ANTHROPIC_API_KEY` |
| `report` | `st` | Current budget status for a month | `btk report -m 8 -y 2024` | - |
| `analyze` | `an` | Budget surplus/deficit analysis | `btk analyze -m 6 -y 2024` | `expectedMonthlyPaycheck` |
| `split <id>` | `sp` | Interactive transaction splitting | `btk split 123` | - |

### Common Options

Per-command options:
- `-m, --month <1-12>` - Target month (default: current) — `report`, `analyze`
- `-y, --year <year>` - Target year (default: current) — `report`, `analyze`
- `-h, --help` - Display help

Program-level options — these go **before** the subcommand (`btk --verbose report`):
- `-v, --verbose` - Detailed output
- `--config <path>` - Custom config file path (priority over defaults)

Note `split` has its own `-y, --yes` (skip confirmation), which is unrelated to `--year`.

### Categorize Command Options

The most popular command with additional options:

```bash
# Preview without applying changes
btk categorize Import-2025-06-23 --dry-run

# Re-run the AI on transactions that already have both a category and a budget
btk categorize Import-2025-06-23 --force

# Update categories only or budgets only
btk categorize Import-2025-06-23 --mode category
btk categorize Import-2025-06-23 --mode budget

# Verbose logging for debugging (--verbose is a program-level flag, so it
# goes BEFORE the subcommand)
btk --verbose categorize Import-2025-06-23
LOG_LEVEL=debug npm start -- categorize Import-2025-06-23
```

**Options:**
- `-m, --mode <type>` - Update `category`, `budget`, or `both` (default: `both`)
- `-f, --force` - Re-run the AI on transactions that already have both a category and a budget. Also lets an AI category replace an existing one; without it an existing `category_id` is preserved
- `-n, --dry-run` - Preview changes without applying

**Note:** Transactions must be tagged in Firefly III with the specified tag.

### Split Command Options

```bash
# Fully interactive (prompts for amount and descriptions)
btk split 123

# Provide amount via CLI
btk split 123 --amount 50.00

# Skip confirmation
btk split 123 -a 50.00 -d "- Groceries" -d "- Hardware" -y
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
btk [command] [options]

# Development mode (no compilation needed)
npm start -- [command] [options]

# With development config
npm run start:dev -- [command] [options]

# Verbose logging
LOG_LEVEL=debug btk categorize Import-2025-06-23
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
