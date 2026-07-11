# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Module System

This project uses **ECMAScript Modules (ESM)** - the modern JavaScript module standard.

**Key ESM Requirements:**

- All relative imports must include `.js` extensions (e.g., `import { foo } from './bar.js'`)
- Package type is set to `"module"` in package.json
- TypeScript compiles to ESM format (`module: "nodenext"`)
- Jest uses ESM configuration with `@jest/globals` imports

**When adding new files:**

- Always use `.js` extensions for relative imports in TypeScript files
- Import `jest` from `@jest/globals` in test files: `import { jest } from '@jest/globals'`
- Use `import.meta.url` for file/directory paths (not `__dirname`/`__filename`)

## Development Commands

### Building and Running

- `npm run compile` - Compile TypeScript to ESM JavaScript in `/dist`
- `npm start -- [command] [options]` - Run in development mode with tsx (use this for testing/development)
- `./budget.sh [command] [options]` - Run compiled CLI (production mode, requires compilation first)

**Important:** For integration testing during development, always use `npm start` instead of `./budget.sh` to avoid compilation delays and ensure latest code changes are tested.

### Testing

- `npm test` - Run all tests with ESM configuration
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode

### Code Quality

- `npm run linter` - Run ESLint and Prettier (lint + format)

### Docker Development

- See `DOCKER.md` for Docker environment setup and `npm run start:dev` usage

## Configuration System

This project uses a unified configuration system managed by `ConfigManager` singleton.

### Configuration Loading Priority

Configuration is loaded with clear precedence (high to low):

1. **YAML Configuration** (`config.yaml`) - Highest priority
2. **Environment Variables** (`.env`) - Overrides defaults
3. **Code Defaults** (`src/config/config.defaults.ts`) - Lowest priority

### Configuration Manager

The `ConfigManager` singleton (`src/config/config-manager.ts`) provides centralized configuration:

- Loads configuration at startup
- Validates all values with descriptive errors
- Provides strongly-typed configuration access
- Services receive configuration via dependency injection

### YAML Configuration (`config.yaml`)

**Account Configuration:**

- `incomeDestinationAccounts` - Array of account IDs that are valid deposit destinations for income
- `expenseSourceAccounts` - Array of account IDs (asset accounts) that withdrawals must source from to count as expenses. Independent of `incomeDestinationAccounts` (checks the opposite side of different transaction types) — the same account ID often belongs in both lists
- `expenseTransfers` - Array of transfer configurations (source/destination pairs) that count as unbudgeted expenses
- `disposableIncomeAccounts` - Array of account IDs for discretionary/disposable spending accounts (e.g., a credit card for personal expenses); used by `DisposableIncomeService` for surplus calculations

**Transaction Configuration:**

- `expectedMonthlyPaycheck` - Expected monthly paycheck amount for surplus calculations
- `excludedAdditionalIncomePatterns` - Transaction descriptions to exclude (e.g., "PAYROLL")
- `excludeDisposableIncome` - Whether to exclude disposable income transactions
- `excludedTransactions` - Array of transactions to globally exclude; each entry requires `description` with optional `amount` and `reason` fields

**Transaction Tags Configuration:**

- `tags.disposableIncome` - Tag name for identifying disposable income transactions (default: "Disposable Income")
- `tags.paycheck` - Tag name for identifying paycheck transactions (default: "Paycheck")

**Firefly Configuration:**

- `firefly.noNameExpenseAccountId` - Account ID for transactions with no destination

**LLM Configuration:**

- `llm.model` - Claude model name
- `llm.temperature` - Temperature setting (0-1)
- `llm.maxTokens` - Max tokens per request
- `llm.batchSize` - Batch processing size
- `llm.maxConcurrent` - Max concurrent requests
- `llm.retryDelayMs` / `llm.maxRetryDelayMs` - Retry configuration
- `llm.rateLimit.*` - Rate limiting settings
- `llm.circuitBreaker.*` - Circuit breaker configuration

### Environment Variables (`.env`)

**Required:**

- `FIREFLY_API_URL` - Firefly III API endpoint
- `FIREFLY_API_TOKEN` - API authentication token

**Optional:**

- `ANTHROPIC_API_KEY` - Claude AI API key (required only for `categorize` command)
- `LOG_LEVEL` - Logging level (trace, debug, info, warn, error, silent)
- `CLIENT_CERT_CA_PATH` - CA certificate path for mTLS
- `CLIENT_CERT_PATH` - Client certificate path for mTLS
- `CLIENT_CERT_PASSWORD` - Certificate password

## Architecture Overview

### Command Pattern Architecture

The CLI uses a command pattern with four main commands defined in `src/cli.ts`:

1. **analyze** (alias: `an`) - Comprehensive cash flow and budget analysis including:
    - Actual paycheck and additional income (deposits not from payroll)
    - Bills paid and budgeted spending vs. allocation
    - Unbudgeted expenses and disposable income
    - True cash flow net impact calculation

2. **report** (alias: `st`) - Shows current budget report for a given month

3. **categorize** `<tag>` (alias: `cat`) - Uses Claude AI to automatically categorize and budget transactions. Requires a positional `<tag>` argument (the Firefly III import tag, e.g., `Import-2025-06-23`) identifying which transactions to process.
    - By default, processes uncategorized transactions and transactions with category but no budget
    - Transactions with both category and budget are skipped unless `--force` is used
    - Supports mode options: `--mode category` (category only), `--mode budget` (budget only), `--mode both` (default)
    - Use `--force` (`-f`) to re-run AI on transactions that already have both category and budget
    - Use `--dry-run` (`-n`) to preview changes without applying

4. **split** `<transaction-id>` (alias: `sp`) - Interactively splits a transaction into two parts. Preserves metadata (category, budget, tags) on the first split; leaves the second split uncategorized for manual assignment in Firefly III. Validates split amounts within 0.01 floating-point tolerance.

### Service Layer Architecture

Services are organized by role and all wired in `ServiceFactory.createServices()` (`src/factories/service.factory.ts`):

- **Core Services** (`src/services/core/`): Firefly III API wrappers (transactions, budgets, categories) and transaction utilities (classification, validation).
- **Business Logic Services** (`src/services/`): Analyzers and utilities (additional income, unbudgeted expenses, paycheck surplus, transaction splitting, excluded transaction filtering, AI orchestration).
- **AI Services** (`src/services/ai/`): Claude integration with structured prompts and transaction mapping.
- **Display Services** (`src/services/display/`): CLI output formatting for reports, analysis, and status messages.

**Pattern:** Business logic analysis services extend `BaseTransactionAnalysisService`, which provides a template method: validate date range → fetch transactions → call `analyzeTransactions()` → return results. Examples: `AdditionalIncomeService`, `UnbudgetedExpenseService`, `PaycheckSurplusService`, `DisposableIncomeService`.

**Configuration:** All services receive configuration via constructor injection (never load themselves). Configuration comes from `ConfigManager` singleton, with priority: YAML > environment variables > defaults.

### Transaction Classification System

The `TransactionClassificationService` provides the core logic for classifying transactions:

- **Deposits**: `type === "deposit"`
- **Transfers**: `type === "transfer"`
- **Bills**: Transactions linked to a bill (bill_id or subscription_id is set)
- **Disposable Income**: Transactions tagged with configured disposable income tag (default: "Disposable Income")
- **Paychecks**: Transactions tagged with configured paycheck tag (default: "Paycheck"). Supports all transaction types (deposits, transfers, etc).

### Transaction Splitting System

The `TransactionSplitService` provides functionality for splitting transactions with controlled metadata preservation:

**Metadata Handling:**

- **First Split** (updates original transaction):
    - Automatically copies category, budget, and tags from original transaction
    - Preserves transaction journal ID
- **Second Split** (creates new transaction):
    - Category and budget are intentionally left undefined for manual assignment in Firefly III
    - Tags are not copied
    - Essential fields preserved: type, date, accounts, currency
    - New transaction journal ID generated by Firefly III

**Validation:**

- Split amounts must sum to original amount within 0.01 epsilon (floating-point tolerance)
- Each split must be at least 0.01; amounts limited to 2 decimal places
- Transaction must not already be split (single-split transactions only)

### AI Integration

Claude AI integration through `@anthropic-ai/sdk`:

- Configuration in `src/config/llm.config.ts`
- **Function Calling**: Uses Claude's function calling feature for structured responses
    - Eliminates need for fuzzy string matching
    - Enforces response schema with enum validation
    - Provides reliable, type-safe AI responses
- **Unified Assignment Service**: `LLMAssignmentService` handles both categories and budgets
    - Single implementation using DRY principles
    - Delegates batching to `ClaudeClient` for optimal performance
    - No retry logic in service layer (handled by client)
- **Batch Processing**: Handled by `ClaudeClient` with rate limiting and concurrency control
- **Validation**: AI responses validated against available options before applying
- **Dry-run mode**: Test AI suggestions without making changes

## Key Files and Patterns

### Adding New Configuration

To add a new configuration key:

1. Add type to `config.types.ts`
2. Add default to `config.defaults.ts`
3. Add YAML mapping in `config-manager.ts` (if YAML supported)
4. Add validation in `config.validator.ts` (if needed)
5. Inject value in `ServiceFactory` to services that need it

### Service Creation

- `src/factories/service.factory.ts` - Central service factory; all new services must be instantiated and returned here for consistent dependency injection

### Error Handling

- Structured logging via Pino logger (`src/logger.ts`)
- Services throw descriptive errors with context
- Commands catch and log errors before exiting

### Logging Best Practices

- **User-facing output**: Use `console.log/error` for CLI output (reports, summaries, results)
    - This goes to stdout/stderr and can be piped/redirected
    - Clean, formatted output without JSON structure
- **Diagnostic logging**: Use `logger.debug/info/warn/error` for operational diagnostics
    - Structured JSON logs controlled by `LOG_LEVEL` environment variable
    - Includes context objects for troubleshooting
    - Examples: API errors, validation failures, processing statistics

### Transaction Filtering

Transaction analysis services follow a consistent pattern: fetch transactions for the month, apply business logic filters via `.filter()` chains, and return results.

### Testing

- Comprehensive test coverage in `__tests__/` directories
- Test both success and error scenarios
- Services are tested independently with mocked dependencies
- Test files: `import { jest } from '@jest/globals'` for mocking (ESM requirement)
