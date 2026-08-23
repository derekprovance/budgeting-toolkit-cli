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
- `expenseTransfers` - Array of transfer configurations (source/destination pairs) that count as unbudgeted expenses. Do **not** list a transfer that funds a disposable/cash account: spending out of that account is already charged once via the disposable income tag, so listing the funding transfer charges the same dollars twice
- `disposableIncomeAccounts` - Array of account IDs for discretionary/disposable spending accounts (e.g., a credit card for personal expenses); used by `DisposableIncomeService` for surplus calculations
- `paycheckDestinationAccounts` - Array of account IDs a paycheck-tagged transaction must be destined for to count as a paycheck. Empty (the default) means the tag alone decides. Use it when payroll is split across accounts and only one half is the paycheck: a stray tag on the other half is then disregarded and falls through to additional income rather than inflating paycheck income

**Transaction Configuration:**

- `expectedMonthlyPaycheck` - Expected monthly paycheck amount for surplus calculations
- `excludedAdditionalIncomePatterns` - Transaction descriptions to exclude (e.g., "PAYROLL"). Matched **whole-word** by `StringUtils.matchesAnyPattern`, splitting on punctuation, so `transfer` will not swallow `Transferwise`. A pattern fused into a longer word (`ACHPAYROLLDEP`) therefore will not match — write patterns as they appear as words. Do not add `TRANSFER` here: additional income already filters on deposit type, so the pattern can only discard legitimate deposits
- `excludeDisposableIncome` - Whether to exclude disposable income transactions
- `excludedTransactions` - Array of transactions to globally exclude; each entry requires `description` with optional `amount` and `reason` fields

**Transaction Tags Configuration:**

- `tags.disposableIncome` - Tag name for identifying disposable income transactions (default: "Disposable Income")
- `tags.paycheck` - Tag name for identifying paycheck transactions (default: "Paycheck")

**Firefly Configuration:**

- `firefly.noNameExpenseAccountId` - Account ID for transactions with no destination

**LLM Configuration:**

- `llm.model` - Claude model name
- `llm.maxTokens` - Max tokens per request
- `llm.batchSize` - Batch processing size
- `llm.maxConcurrent` - Max concurrent requests
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

2. **report** (alias: `st`) - Shows current budget report for a given month. Its two spending sections are deliberately different:
    - **Unbudgeted Expenses** - the bucket that feeds `netImpact`, from `UnbudgetedExpenseService`. Same definition `analyze` uses, so the two commands always agree
    - **Untracked Spending** - withdrawals charged to _no_ bucket at all (not budget, bill, disposable, or unbudgeted). In practice this is spending from an account outside `expenseSourceAccounts`, which the cash-flow net deliberately ignores. It is a diagnostic, not part of the net

3. **categorize** `<tag>` (alias: `cat`) - Uses Claude AI to automatically categorize and budget transactions. Requires a positional `<tag>` argument (the Firefly III import tag, e.g., `Import-2025-06-23`) identifying which transactions to process.
    - By default, processes uncategorized transactions and transactions with category but no budget
    - Transactions with both category and budget are skipped unless `--force` is used
    - `--force` also lets the AI category replace an existing one (without it, an existing `category_id` is preserved)
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
- **Paychecks**: Transactions tagged with the configured paycheck tag (default: "Paycheck") **and**, when `paycheckDestinationAccounts` is configured, destined for one of those accounts. Supports all transaction types (deposits, transfers, etc).

The account constraint lives in `isPaycheck` rather than in its callers on purpose. The same predicate decides what `PaycheckSurplusService` counts and what `AdditionalIncomeService` steps aside for, so a transaction rejected as a paycheck falls through to additional income instead of disappearing from both buckets.

**Amount sign convention (verified against Firefly III 6.6.6):** `GET /v1/transactions` returns `amount` **unsigned** — withdrawals, deposits, and transfers are all positive, and direction comes from `type`. Never identify spending with `amount < 0`; use `isWithdrawal()`.

Because direction lives in `type`, never total a mixed set of transactions with `calculateTransactionTotal(..., useAbsolute)` — a refund would inflate the very bucket it should reduce. Use `TransactionCalculationUtils.calculateNetSpend()` (withdrawals and transfers add, deposits subtract) or `calculateNetIncome()` (its mirror, for paycheck totals).

Separately, `GET /v1/insight/expense/budget` returns `difference_float` **negative** per budget. Convert it by negating, never with `Math.abs` per budget: a budget whose refunds exceed its outflows reports a _positive_ value, and taking its absolute value would count that refund as spending.

**Bucket precedence for the analyze report.** Each transaction must be charged exactly once, so the expense buckets are disjoint by construction, in the order **bill > disposable > unbudgeted** (`UnbudgetedExpenseService` excludes bills and disposable; `DisposableIncomeService` excludes bills). On the income side, **paycheck > additional income** (`AdditionalIncomeService` excludes paycheck-tagged transactions).

Bill-linked transactions are counted by `BillComparisonService` even when the bill is deactivated or missing from the bill list entirely — every other bucket rejects a bill-linked transaction, so without that they would be charged nowhere.

The one overlap that cannot be filtered is `budgetSpent`: it comes from Firefly's server-side rollup (`insight/expense/budget`), which returns one number per budget with no per-transaction handle. A bill or disposable transaction that also carries a budget is therefore inside it. Those transactions are reported by `BillComparisonDto.budgetedTransactions` / `DisposableIncomeAnalysis.budgetedTransactions`, added back once in `AnalyzeReportDto` (`doubleCountedTotal`), and surfaced as a warning so the data can be corrected in Firefly.

**The correction is bounded, and must stay bounded.** It credits back spending that was subtracted twice, so it can never exceed what each bucket actually subtracted, nor `budgetSpent` itself. The disposable bucket is the reason this matters: its balance is net of transfers and floored at zero, while its budgeted-transaction list is neither, so an uncapped add-back invents cash that was never spent.

The same rollup is also blind to `excludedTransactions`, which is filtered client-side. `AnalyzeCommand` subtracts excluded budgeted spending from `budgetSpent` so both sides describe the same set of transactions.

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
- **Tool Use**: Uses Claude's tool-use API (`Anthropic.Tool` + forced `tool_choice`) for structured responses
    - Eliminates need for fuzzy string matching
    - Enforces response schema with enum validation (the `(no category)`/`(no budget)` sentinel is added by the schema, not by callers)
    - `ClaudeClient` extracts only the matching `tool_use` block, so preamble text can never corrupt the payload
- **Unified Assignment Service**: `LLMAssignmentService` handles both categories and budgets
    - Chunks transactions by `llm.batchSize` and runs a bounded worker pool (`llm.maxConcurrent`), preserving input order
    - A recoverable chunk failure degrades only that chunk to the sentinel; auth/permission/bad-request errors abort the run
- **Retries**: Owned entirely by the Anthropic SDK (`api.claude.maxRetries`), which honors `retry-after`
- **Circuit Breaker**: One failure per logical request; HALF_OPEN requires a single successful probe to close
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

### Pagination

Firefly III paginates **every** list endpoint and defaults to 50 items per page. Reading `response.data` alone therefore silently truncates any busy month. All list calls must go through `fetchAllPages()` (`src/utils/pagination.utils.ts`), which follows `meta.pagination.total_pages`.

The one exception is `budgets.listBudgetLimit`, which the SDK exposes with no `page` parameter; `BudgetService.getBudgetLimits` logs a warning when the response reports more than one page.

### Transaction Filtering

Transaction analysis services follow a consistent pattern: fetch transactions for the month, apply business logic filters via `.filter()` chains, and return results.

### Testing

- Comprehensive test coverage in `__tests__/` directories
- Test both success and error scenarios
- Services are tested independently with mocked dependencies
- Test files: `import { jest } from '@jest/globals'` for mocking (ESM requirement)
