# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Tool Is For

This tool measures **one isolated envelope: cost of living.** `Net Cash Flow` in
the analyze report answers whether it fit inside what the user pays themselves
into checking. It is deliberately not a household cash-flow statement.

**`RULES.md` is the single source of truth for what the tool counts and why.
Read it before touching anything that decides which transactions count as
income or spending.** It wins over the code, this file and agent memory. Do not
restate its rules here or re-derive them from the code; that is how the tool
drifted before. Changing a rule needs the user's explicit approval and a dated
entry in its Changelog.

Every rule id (`R-SCOPE-1`, …) must be named by at least one test
(`[R-XFER-1] ignores a card payment`). `__tests__/meta/rules-coverage.test.ts`
fails otherwise, and also fails on a test naming a rule that no longer exists.

### Where each rule lives in code

| Rules                                  | Code                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| R-SCOPE-1, R-INCOME-1 (which accounts) | `AccountScopeService.getScope` (`src/services/core/account-scope.service.ts`)                           |
| Every bucket decision                  | `TransactionClassificationService.classify` (`src/services/core/transaction-classification.service.ts`) |
| Sorting a month into buckets           | `CashFlowService.getBuckets` (`src/services/cash-flow.service.ts`)                                      |
| R-PURPOSE-1, R-DISP-1 (the net)        | `AnalyzeReportDto.create` (`src/types/dto/analyze-report.dto.ts`)                                       |
| R-BILL-1 (predicted vs actual)         | `BillComparisonService` (`src/services/bill-comparison.service.ts`)                                     |
| R-BUDGET-1 (per-budget rows)           | `BudgetReportService` (`src/services/budget-report.service.ts`)                                         |
| R-EXCL-1                               | `TransactionService.getFromCacheOrFetch` (`src/services/core/transaction.service.ts`)                   |

Everything downstream totals the buckets `CashFlowService` returns — `analyze`,
`report`, bill actuals, budget rows, top expenses — so no two figures can
disagree about what a transaction is. Add a new figure the same way; never add a
second filter chain over raw transactions.

The owner's real accounts and data facts (payroll halves, account ids) are in
agent memory, not here.

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
- `npm run start:dev -- [command] [options]` - Same, with `ENV_FILE=.env.dev` (the local Docker Firefly; see `DOCKER.md`)
- `btk [command] [options]` - Run the installed CLI (requires `npm run dev:install`; `npm run compile` alone only writes `dist/`)

**Important:** For integration testing during development, always use `npm start` instead of `btk` to avoid compilation delays and ensure latest code changes are tested.

`analyze` and `report` accept `--json`: stdout then carries only a versioned
JSON document (`schemaVersion: 2`, types in `src/types/dto/report-json.types.ts`)
and the spinner is silenced. A breaking change to that shape must bump
`schemaVersion`. Structured logs always go to **stderr** (`src/logger.ts`), so
they can never corrupt stdout.

**Environment switches:**

- `BTK_PAGE_SIZE` - Page size requested from Firefly list endpoints, 1–500
  (default 500). An invalid value warns and falls back. Read once at module
  load, so it must be in the process environment; a value in a `.env` file is
  not seen. The harness sets 10 so a small ledger spans several pages.
- `BTK_STRICT_CONFIG=1` - Disables every implicit config fallback (`./.env`,
  `~/.budget/.env`, `./config.yaml`, `~/.budget/config.yaml`). `ENV_FILE` and
  `--config` become mandatory and a missing file is an error. Unit tests and
  e2e always run strict, so they can never reach the real Firefly.

### Testing

- `npm test` - Unit tests plus the Docker-free in-process scenario tests
- `npm run test:coverage` - Same, with coverage
- `npm run test:watch` - Watch mode
- `npm run typecheck:tests` - Typecheck `src/`, `__tests__/`, `test-harness/`, `e2e/` and `scripts/` (`tsconfig.test.json`); Jest itself does not typecheck
- `npm run test:e2e` - Full e2e lifecycle against a real, ephemeral Firefly in Docker: up → seed → Jest (`e2e/jest.config.mjs`) → down
- `npm run test:e2e:reuse` - Same, but leaves the stack running and skips seeding when the seed marker matches
- `npm run e2e:up` / `e2e:seed` / `e2e:down` - The individual lifecycle steps

See "Testing" below and `DOCKER.md` for the e2e stack.

### Code Quality

- `npm run linter` - Run ESLint and Prettier (lint + format)

### Docker Development

- See `DOCKER.md` for the local Firefly stack (`docker-compose.yml`) and the e2e stack (`docker-compose.e2e.yml`)

## Configuration System

This project uses a unified configuration system managed by `ConfigManager` singleton.

### Configuration Loading Priority

Configuration is loaded with clear precedence (high to low):

1. **YAML Configuration** (`config.yaml`) - Highest priority
2. **Environment Variables** (`.env`) - Overrides defaults
3. **Code Defaults** (`src/config/config.defaults.ts`) - Lowest priority

File lookup: `--config`, then `./config.yaml`, then `~/.budget/config.yaml`; and
`ENV_FILE`, then `./.env`, then `~/.budget/.env`. `BTK_STRICT_CONFIG=1` allows
only the explicit ones.

### Configuration Manager

The `ConfigManager` singleton (`src/config/config-manager.ts`) provides centralized configuration:

- Loads configuration at startup
- Validates all values with descriptive errors
- Provides strongly-typed configuration access
- Services receive configuration via dependency injection

### YAML Configuration (`config.yaml`)

**Account Configuration:**

- `untrackedAccounts` - Array of account IDs outside the cost-of-living envelope: savings, a brokerage, the disposable pool. It is the **only** setting that draws the envelope (RULES.md, R-SCOPE-1): every other asset account (closed ones included) is inside it, and income accounts are derived as the envelope minus credit cards (`account_role: ccAsset`)

**Transaction Configuration:**

- `expectedMonthlyPaycheck` - Expected monthly paycheck amount for surplus calculations; required by `analyze`
- `excludedTransactions` - Array of transactions removed from the whole tool (RULES.md, R-EXCL-1); each entry requires `description`, with optional `amount` and `reason`. `description` is matched **whole-string** after trim and lower-case (not a substring), and `amount` narrows a rule to one amount, compared numerically on absolute value after currency cleaning. **Amount-only rules are rejected by `ConfigValidator` at startup**: a rule with no description would drop every transaction of that amount on any account in either direction. A malformed `amount` is rejected for the same reason — it would otherwise sit in the config matching nothing. Both the validator and the matcher parse amounts with `TransactionCalculationUtils.parseAmountSafe`, so they cannot disagree

Any other top-level key is reported as an unknown setting and ignored. Old configuration is not migrated: a breaking change simply changes the keys.

**Transaction Tags Configuration:**

- `tags.disposableIncome` - Tag name for identifying disposable income transactions (default: "Disposable Income")
- `tags.paycheck` - Tag name for identifying paycheck transactions (default: "Paycheck")

**Categorize Configuration:**

- `categorize.historyMonths` - Months `categorize` looks back for an earlier transaction with the same normalized description (`normalizeDescription`, `src/utils/description-normalizer.ts`: lower-cased, tokens containing a digit dropped). Its category and budget are suggested first; only fields history cannot fill (or whose name no longer exists) go to the AI. Default 12, `0` disables, integer 0–120

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

`ENV_FILE`, `BTK_PAGE_SIZE` and `BTK_STRICT_CONFIG` are read from the process
environment, not from a `.env` file (see "Development Commands").

## Architecture Overview

### Command Pattern Architecture

The CLI uses a command pattern with four main commands defined in `src/cli.ts`. `analyze` and `report` are built by `src/factories/command.factory.ts` and return their report DTO:

1. **analyze** (alias: `an`) - Comprehensive cash flow and budget analysis including:
    - Actual paycheck and additional income
    - Bills paid and budgeted spending vs. allocation
    - Unbudgeted expenses and disposable income
    - True cash flow net impact calculation

2. **report** (alias: `st`) - Shows the budget report for a given month: per-budget rows, bills, top expenses and the **Unbudgeted Expenses** bucket. Every figure comes from the same buckets `analyze` uses, so the two commands always agree. Activity in outside accounts is not shown

3. **categorize** `<tag>` (alias: `cat`) - Uses Claude AI to automatically categorize and budget transactions. Requires a positional `<tag>` argument (the Firefly III import tag, e.g., `Import-2025-06-23`) identifying which transactions to process.
    - Suggestions come from history first (`TransactionHistoryService`: the latest matching transaction in the last `categorize.historyMonths` months), then the AI for whatever is left; the confirm prompt labels each value `(history)` or `(AI)`. The category comes from the newest match of either direction; the budget only from the newest match that could carry one (`shouldSetBudget`: not a deposit, bill-linked or disposable-income transaction). Such a match with no budget keeps the transaction unbudgeted (no AI call), while a refund deposit says nothing about the budget. A budget is never asked for on a transaction the validator would refuse it on (V8). History is optional: a failed fetch is logged and every suggestion comes from the AI
    - Every suggestion is validated (`InteractiveTransactionUpdater.prepareUpdate`) before the first prompt, so the `[index/total]` counter counts exactly the prompts shown
    - By default, processes uncategorized transactions and transactions with category but no budget
    - Transactions with both category and budget are skipped unless `--force` is used
    - `--force` also lets the AI category replace an existing one (without it, an existing `category_id` is preserved)
    - Supports mode options: `--mode category` (category only), `--mode budget` (budget only), `--mode both` (default)
    - Use `--force` (`-f`) to re-run AI on transactions that already have both category and budget
    - Use `--dry-run` (`-n`) to preview changes without applying

4. **split** `<transaction-id>` (alias: `sp`) - Interactively splits a transaction into two parts. Preserves metadata (category, budget, tags) on the first split; leaves the second split uncategorized for manual assignment in Firefly III. Validates split amounts within 0.01 floating-point tolerance.

### Service Layer Architecture

Services are organized by role and all wired in `ServiceFactory.createServices(apiClient, config)` (`src/factories/service.factory.ts`); `config` defaults to the `ConfigManager` singleton, and tests pass their own:

- **Core Services** (`src/services/core/`): Firefly III API wrappers (transactions, budgets, categories) and transaction utilities (classification, validation).
- **Business Logic Services** (`src/services/`): `CashFlowService` (the month's buckets), bill comparison, budget report and analytics, transaction splitting, excluded transaction filtering, AI orchestration.
- **AI Services** (`src/services/ai/`): Claude integration with structured prompts and transaction mapping.
- **Display Services** (`src/services/display/`): CLI output formatting for reports, analysis, and status messages, plus the `--json` serializers.

**Pattern:** `CashFlowService` extends `BaseTransactionAnalysisService`, which provides a template method: validate date range → fetch transactions → call `analyzeTransactions()` → return a `Result`.

**Configuration:** All services receive configuration via constructor injection (never load themselves). Configuration comes from `ConfigManager` singleton, with priority: YAML > environment variables > defaults.

### Transaction Classification System

`TransactionClassificationService.classify(transaction, scope)` returns the one bucket a transaction is charged to — `paycheck`, `additionalIncome`, `bill`, `disposable`, `budget`, `unbudgeted` — or `null` when it is counted nowhere. It implements RULES.md; the rule ids are in its comments. The single-purpose predicates (`isBill`, `hasBudget`, `isPaycheck`, …) remain for `categorize` and `split`.

**Amount sign convention (verified against Firefly III 6.6.6):** `GET /v1/transactions` returns `amount` **unsigned** — withdrawals, deposits, and transfers are all positive, and direction comes from `type`. Never identify spending with `amount < 0`; use `isWithdrawal()`.

Because direction lives in `type`, total a bucket with `TransactionCalculationUtils.calculateNetSpend()` (withdrawals and transfers add, deposits subtract) or `calculateNetIncome()` (its mirror). An absolute sum would let a refund inflate the very bucket it should reduce.

**Firefly facts that shape the rules** (evidence in `test-harness/VERIFICATION.md`): a budget is silently dropped on a deposit or transfer (V8), and so is a bill link on a transfer (V20). A transfer therefore carries no marker but tags, and a refund can never carry a budget.

Bill-linked transactions are counted by `BillComparisonService` even when the bill is deactivated or missing from the bill list entirely — no other bucket takes a bill-linked transaction, so without that they would be charged nowhere.

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
- `src/factories/command.factory.ts` - Builds `analyze` and `report` from the service bundle, shared by `cli.ts` and the in-process scenario tests

### Error Handling

- Structured logging via Pino logger (`src/logger.ts`)
- Services throw descriptive errors with context
- Commands catch and log errors before exiting; `cli.ts` also prints a one-line `Error …` to stderr, since the structured log is silent by default

### Logging Best Practices

- **User-facing output**: Use `console.log/error` for CLI output (reports, summaries, results)
    - This goes to stdout/stderr and can be piped/redirected
    - Clean, formatted output without JSON structure
    - In `--json` mode stdout must carry nothing but the JSON document
- **Diagnostic logging**: Use `logger.debug/info/warn/error` for operational diagnostics
    - Structured JSON logs written to **stderr**, controlled by `LOG_LEVEL`
    - Includes context objects for troubleshooting
    - Examples: API errors, validation failures, processing statistics

### Pagination

Firefly III paginates **every** list endpoint and defaults to 50 items per page. Reading `response.data` alone therefore silently truncates any busy month. All list calls must go through `fetchAllPages()` (`src/utils/pagination.utils.ts`), which requests `PAGE_SIZE` items per page (500, or `BTK_PAGE_SIZE`) and follows `meta.pagination.total_pages`. Firefly 6.6.6 does not cap `limit` (V14), but the loop never assumes the requested size was honored.

The one exception is `budgets.listBudgetLimit`, which the SDK exposes with no `page` parameter; `BudgetService.getBudgetLimits` logs a warning when the response reports more than one page.

### Transaction Filtering

There is one filter: `classify`. Code that needs a set of transactions takes it from `CashFlowService.getBuckets` rather than filtering the raw month itself.

## Testing

### Three layers, one scenario

1. **Unit tests** (`__tests__/**`, part of `npm test`) - services tested independently with injected mocks. Name the RULES.md rule a test pins in its title: `[R-XFER-1] …`.
2. **In-process scenario tests** (`__tests__/scenario/`, part of `npm test`, no Docker) - a real `FireflyClientWithCerts` talks to an in-memory fake Firefly (`test-harness/fake-firefly/server.ts`), so the SDK, axios and `fetchAllPages` all run for real. `seedScenario` seeds the fake, then the real commands run through `ServiceFactory` + `command.factory` in both JSON and text formats.
3. **E2E** (`e2e/`, `npm run test:e2e`) - the CLI is spawned against a pinned, auto-bootstrapped Firefly 6.6.6 in Docker (see `DOCKER.md`).

Layers 2 and 3 run the **same** shared suites (`test-harness/suites/*.suite.ts`) against the **same** scenario.

### The scenario is the single source of truth

`test-harness/scenario/` defines it: `ledger.ts` (accounts, bills, budgets, tags and transactions by month, referenced by key rather than id), `config.ts` (the config built from the seeded id map), and `expected.ts` (the expected results). Fixed months, `TZ=UTC`.

- **Expected values are hand-derived literals from RULES.md**, each with a derivation comment citing the rule ids. They must never be computed by, or import from, `src/`: a value derived by the code under test cannot catch that code's bugs. ESLint enforces this with `no-restricted-imports` on `test-harness/scenario/**` and `test-harness/fake-firefly/**`.
- **`test-harness/scenario/firefly-contract.ts` is the only place observed Firefly behavior is recorded** (bill pay dates, pagination, inclusive end dates, account and currency readback). The fake server is built from it, and the `firefly-contract` suite runs the same literals against real Firefly in e2e. If the two disagree, correct the literal, citing the evidence in `test-harness/VERIFICATION.md`.
- Changing `ledger.ts` or `config.ts` changes `scenarioHash()`, which invalidates a reused e2e database.

### Known defects

Where the code disagrees with RULES.md, the test asserts the **rule** and runs as `test.failing`, driven by the `KNOWN_DEFECTS` list in `expected.ts` (each entry: KD id, field, expected value, today's value, and the rule it contradicts). A fix makes the assertion pass, which fails the `test.failing` and forces the entry's removal, so the list cannot silently go stale. The list is empty today. Never "fix" a failing assertion by changing the expected literal to what the code produces.

### Unit-test rules

- **`jest.mock` is inert under native ESM.** It is not hoisted and does not intercept ES module linking, so it silently does nothing. The canary `__tests__/meta/esm-mocking.test.ts` proves it and fails if that ever changes. Inject dependencies through constructors, or use `jest.unstable_mockModule(...)` followed by a dynamic `await import(...)` (as `__tests__/cli.test.ts` does).
- Build transactions with the typed builders in `__tests__/shared/test-data.ts` — `withdrawal()`, `deposit()`, `transfer()` — which set a fixed date, an **unsigned** amount and an explicit `type`, matching Firefly's sign convention. Reuse `createMockAccountScopeService`, `createMockCashFlowService`, `buckets()` and `mockDate` rather than hand-rolling them.
- `__tests__/setup/env.ts` runs before every test file: `FORCE_COLOR=0`, `LOG_LEVEL=silent`, `BTK_STRICT_CONFIG=1`, and a temp `HOME`, so no test can read the real `config.yaml` or `~/.budget` credentials.
- Import `jest` from `@jest/globals`. Jest does not typecheck; run `npm run typecheck:tests`.
- Test both success and error scenarios.

### E2E safety guard

The e2e suite must never touch the real Firefly or Anthropic.

- `assertLocalFirefly` (`test-harness/safety.ts`) refuses any URL not on `127.0.0.1`/`localhost`; `scripts/e2e/up.sh` insists on a loopback binding, and the seeder and e2e global setup also check that the token belongs to `e2e@btk.invalid`.
- The CLI is spawned with an environment built **from scratch** (`buildChildEnv`): `PATH`, a temp `HOME`, `ENV_FILE=.e2e/env`, `BTK_STRICT_CONFIG=1`, `BTK_PAGE_SIZE=10`, `LOG_LEVEL=silent`, `TZ=UTC`, in a fresh temp `cwd`. Nothing is inherited from `FIREFLY_*` or `ANTHROPIC_*`, and passing `ANTHROPIC_*` is rejected outright.
- Strict config means a missing `.e2e/` artifact fails loudly instead of falling back to `~/.budget/.env`.
