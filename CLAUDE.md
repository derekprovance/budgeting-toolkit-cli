# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Tool Is For

This tool measures **one isolated envelope: cost of living.** The user pays
themselves a fixed amount into checking, and the question is whether cost of
living fit inside it. `Net Cash Flow` in the analyze report is that answer.
Everything else in the report exists to explain it.

**It is deliberately not a household cash-flow statement.** Total income is
larger than the envelope; the remainder is saved outside this tool's purview and
must never appear in the report. If a change makes Net Cash Flow drift toward
"all money in minus all money out," that change is wrong.

Read this section before touching anything that decides which transactions count
as income or spending. The model below is the setup this tool assumes, and it
has been re-derived incorrectly from the code before.

### The account boundary

The envelope is defined by accounts, not by transaction descriptions. An account
is either inside it or outside it, and both directions move together — an
account outside the envelope contributes neither income nor spending. Keeping
that symmetric is the whole design: excluding an account's income while still
charging its spending manufactures a deficit that never happened.

Inside the envelope:

- **Credit cards** are where nearly all spending happens. A card purchase is the
  expense.
- **Checking** receives the paycheck and pays the cards. A card payment is a
  transfer between two tracked accounts, so it is **not** an expense — counting
  it would charge the same purchase twice. The goal is for checking to net to
  roughly zero each cycle.
- **The disposable pool** sources one real bill; see "Disposable income" below.

Outside the envelope, via `untrackedAccounts`. Two distinct cases share that
list:

- **Savings is outside by intent.** It receives the savings half of payroll and
  sources the spending funded by it — investment buys, tax payments. None of
  that is cost of living, so neither side is counted.
- **A brokerage is outside by necessity.** Firefly's `account_role` cannot
  distinguish it from an ordinary savings account — both are `savingAsset` —
  while its outflows are large fund transfers rather than purchases. Only config
  can make that call.

Nothing is silently dropped. Withdrawals from untracked accounts surface under
**Untracked Spending** in the `report` command: visible as a diagnostic,
deliberately outside the net.

Income destinations and expense sources are **derived** from account roles by
`AccountScopeService`, not hand-maintained. Leave the override lists empty; set
them only when a Firefly role is wrong.

### Payroll is split, and only the checking half is income

One deposit lands in checking and carries the `Paycheck` tag — that is the user
paying themselves, and it funds the envelope. A second deposit lands in savings.
**It is not income to this tool.** It never enters the envelope, it is saved, and
counting it would inflate Net Cash Flow substantially and hide the only number
that matters.

Both halves carry an identical payroll description, and every deposit arrives
from Firefly's catch-all `(no name)` revenue account, so neither description nor
payer can tell them apart. **Destination is the only working discriminator**,
which is exactly what the account boundary keys on: savings is in
`untrackedAccounts`, so `AdditionalIncomeService.hasValidDestinationAccount`
rejects the savings half.

`paycheckDestinationAccounts` constrains the `Paycheck` tag by destination as
well, so a stray tag on the savings half cannot inflate paycheck income. Real
data has carried exactly those stray tags, so this is load-bearing rather than
precautionary.

**It is also the only thing protecting the paycheck bucket.** Unlike every other
bucket, `isPaycheck` and `PaycheckSurplusService` never consult
`AccountScopeService` — the paycheck bucket does not know the account boundary
exists. Empty `paycheckDestinationAccounts` (the documented default) and a
Paycheck-tagged deposit into an untracked account would count as envelope income
despite the account being outside the envelope. Keep it set to the checking
account.

**The savings half is therefore counted in no bucket at all — not paycheck, not
additional income. That is intended, not a leak.** Earlier revisions of this
file promised that a paycheck-rejected transaction always "falls through to
additional income rather than vanishing"; that guarantee no longer holds and
should not be restored. Money outside the envelope belongs in no bucket.

**Pulling money back in is not income either.** Savings→checking top-ups are
typed as transfers, so `AdditionalIncomeService` rejects them on type, and
`UnbudgetedExpenseService` rejects them because their _source_ is no longer an
expense source. They are counted nowhere. This is correct: treating a top-up as
income would mask the very overspend it was covering. The deficit stays visible;
the report simply does not explain that savings covered it.

(Note the transfer rule is not simply "listed in `expenseTransfers`". A transfer
must pass `isRegularExpenseTransaction` **and** `shouldCountTransfer`, and the
latter returns true for any transfer with no `destination_id` — so a
destination-less transfer out of a tracked account counts without being listed.)

### Disposable income

There is a separate "guilt-free" pool account — a money-market account,
deliberately outside the budget. The `Disposable Income` tag marks purchases
made **on cards** that are charged to that pool; at the end of a cycle the user
reads the tagged total and moves that much out of the pool into checking to
cover it.

**The tagged purchase is charged to the pool, not the envelope.** It is funded
from the pool rather than from the paycheck, so — exactly like savings-sourced
spending — it must not reduce `Net Cash Flow`. `netImpact` has no
`- disposableIncome` term, and reintroducing one would re-answer the wrong
question.

Instead the report **states the amount as an action**, below the net:

```
  → Transfer from disposable pool:   $250.00  [2 transactions]
    Not included in the net — covers tagged card purchases.
```

That line is the entire point of the tag. `disposableIncome` is net of refunds
and is **not** floored at zero, so a month whose refunds exceed its tagged
spending reports a negative balance; the display inverts the instruction rather
than printing a negative transfer.

Funding the pool and drawing from it are movements between accounts the user
already holds — neither is income nor spending, and neither is modelled. Do not
reintroduce a deduction for the draws.

One deliberate exception: a bill may be paid straight from the pool account, for
instance when a provider discounts debit payment. The pool is therefore a normal
expense source, and that withdrawal is counted like any other — it is a real
bill, not a tagged card purchase.

### Averaged bills

Bills are paid at a levelled average rather than the exact amount due, so
checking runs slightly over or short each month by design. Do not read that
drift as an error, and do not "fix" a bill whose actual differs from its
`amount_avg`.

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

Income destinations and expense sources are **derived** from Firefly's account
roles by `AccountScopeService` (`src/services/core/account-scope.service.ts`):

```
income destinations = active asset accounts, role != ccAsset, minus untracked
expense sources     = active asset accounts,                  minus untracked
```

Credit cards are excluded from income because deposits to them are refunds and statement credits, never income. Inactive accounts are excluded from both — a closed account keeps its history but must not widen the scope.

- `untrackedAccounts` - Array of account IDs outside the cost-of-living envelope. Deposits to them are not income **and** withdrawals from them are not spending — both sides move together, which is what keeps the net honest. Two cases share the list: **savings**, excluded by intent (it receives the savings half of payroll and funds investment buys and tax payments, none of it cost of living), and **a brokerage**, excluded by necessity (it carries the same `savingAsset` role as an ordinary savings account, but its outflows are fund transfers rather than purchases, and Firefly cannot tell those apart). Withdrawals from these accounts remain visible under **Untracked Spending** in the `report` command. Note this does not hide everything: a withdrawal whose _source_ is tracked still counts, even when the money is headed somewhere untracked
- `incomeDestinationAccounts` - **Override.** Empty (the default) derives the list. Non-empty replaces derivation entirely for that side. Set it only when a Firefly `account_role` is wrong and you would rather not fix it there
- `expenseSourceAccounts` - **Override.** Same semantics as above
- `expenseTransfers` - Array of transfer configurations (source/destination pairs) that count as unbudgeted expenses. Note that a transfer funding a disposable pool does **not** belong here: the tagged purchase is already the expense (see "Disposable income" above)
- `paycheckDestinationAccounts` - Array of account IDs a paycheck-tagged transaction must be destined for to count as a paycheck. Empty (the default) means the tag alone decides. Use it when payroll is split across accounts and only one half is the paycheck: a stray tag on the other half is then disregarded rather than inflating paycheck income. Where a rejected transaction lands depends on the account boundary, not on this setting: it reaches additional income only if its destination is still a derived income destination **and** it is a deposit **and** it does not match `excludedAdditionalIncomePatterns`. When the other half's account is in `untrackedAccounts` — as this setup has it — it is counted in no bucket at all, which is the intent

**Transaction Configuration:**

- `expectedMonthlyPaycheck` - Expected monthly paycheck amount for surplus calculations
- `excludedAdditionalIncomePatterns` - Transaction descriptions to exclude. Matched **whole-word** by `StringUtils.matchesAnyPattern`, splitting on punctuation, so `transfer` will not swallow `Transferwise`. A pattern fused into a longer word (`ACHPAYROLLDEP`) therefore will not match — write patterns as they appear as words. Consulted **only** by `AdditionalIncomeService`, so a pattern here can never affect the paycheck bucket. Do not add `TRANSFER`: additional income already filters on deposit type, so the pattern can only discard legitimate deposits. Do not add `PAYROLL` either — prefer the account boundary. Description matching fixes only the income side and would leave savings-sourced spending charged against the checking paycheck; `untrackedAccounts` excludes the deposit symmetrically and covers savings interest and savings spending at the same time
- `excludeDisposableIncome` - Whether to exclude disposable income transactions
- `excludedTransactions` - Array of transactions to globally exclude; each entry requires `description`, with optional `amount` and `reason`. `description` is matched **whole-string** after trim and lower-case (not a substring), and `amount` narrows a rule to one amount, compared numerically on absolute value after currency cleaning. **Amount-only rules are rejected by `ConfigValidator` at startup**: exclusion is applied at fetch time (`TransactionService.getFromCacheOrFetch`), so a match removes the transaction from every bucket in every command, and a rule with no description would drop every transaction of that amount on any account in either direction. A malformed `amount` is rejected for the same reason — it would otherwise sit in the config matching nothing. Both the validator and the matcher parse amounts with `TransactionCalculationUtils.parseAmountSafe`, so they cannot disagree

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
    - **Untracked Spending** - withdrawals charged to _no_ bucket at all (not budget, bill, disposable, or unbudgeted). In practice this is spending from an account the derived scope excludes — an `untrackedAccounts` entry, or an inactive account. It is a diagnostic, not part of the net, and it is where spending funded from outside the envelope stays visible instead of disappearing. Note it is sourced from `getTransactionsWithoutBudget`, so an untracked withdrawal that carries a budget will not appear here — see the `budgetSpent` caveat below

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

The account constraint lives in `isPaycheck` rather than in its callers on purpose: one predicate decides both what `PaycheckSurplusService` counts and what `AdditionalIncomeService` steps aside for, so the two cannot both claim a transaction.

**Rejection from the paycheck bucket is not a promotion to additional income.** A rejected transaction lands there only if it independently passes that service's filters — its destination must be a derived income destination, it must be a deposit, and it must not match `excludedAdditionalIncomePatterns`. Two consequences are deliberate and must not be "fixed": a rejected **transfer** is counted in neither bucket (a transfer between accounts you already hold is not income), and a deposit into an **untracked** account — the savings half of payroll — is counted in neither bucket either, because it is outside the envelope. See "The account boundary".

**Amount sign convention (verified against Firefly III 6.6.6):** `GET /v1/transactions` returns `amount` **unsigned** — withdrawals, deposits, and transfers are all positive, and direction comes from `type`. Never identify spending with `amount < 0`; use `isWithdrawal()`.

Because direction lives in `type`, never total a mixed set of transactions with `calculateTransactionTotal(..., useAbsolute)` — a refund would inflate the very bucket it should reduce. Use `TransactionCalculationUtils.calculateNetSpend()` (withdrawals and transfers add, deposits subtract) or `calculateNetIncome()` (its mirror, for paycheck totals).

Separately, `GET /v1/insight/expense/budget` returns `difference_float` **negative** per budget. Convert it by negating, never with `Math.abs` per budget: a budget whose refunds exceed its outflows reports a _positive_ value, and taking its absolute value would count that refund as spending.

**Bucket precedence for the analyze report.** Each transaction must be charged at most once, so the expense buckets are disjoint by construction, in the order **bill > disposable > unbudgeted** (`UnbudgetedExpenseService` excludes bills and disposable; `DisposableIncomeService` excludes bills). On the income side, **paycheck > additional income** (`AdditionalIncomeService` excludes paycheck-tagged transactions).

Note the disposable bucket is disjoint but does **not** feed the net — it is charged to the pool and reported as an action instead. Its precedence still matters: it is what keeps a tagged purchase out of `unbudgetedExpenses`, which does feed the net.

Bill-linked transactions are counted by `BillComparisonService` even when the bill is deactivated or missing from the bill list entirely — every other bucket rejects a bill-linked transaction, so without that they would be charged nowhere.

The one overlap that cannot be filtered is `budgetSpent`: it comes from Firefly's server-side rollup (`insight/expense/budget`), which returns one number per budget with no per-transaction handle. A bill or disposable transaction that also carries a budget is therefore inside it. Those transactions are reported by `BillComparisonDto.budgetedTransactions` / `DisposableIncomeAnalysis.budgetedTransactions`, added back once in `AnalyzeReportDto` (`budgetRollupCorrection`), and surfaced as a warning so the data can be corrected in Firefly.

**The correction is bounded, and the two halves are bounded differently.** A **bill** carrying a budget is subtracted twice — once as a bill, once inside `budgetSpent` — so its credit back is capped at what the bill bucket actually subtracted; crediting more would invent income. A **disposable** transaction carrying a budget is a different defect: it is charged to the pool, so `netImpact` subtracts it nowhere and only `budgetSpent` still contains it. It is credited back **in full**, with no per-bucket cap — capping it at the disposable balance (as an earlier revision did) under-credits whenever refunds shrink that balance, because the balance is net of refunds and is not floored at zero. Both halves are bounded together by `budgetSpent` itself: the premise of the whole correction is that this spending sits inside that rollup, so it cannot credit back more than the rollup contains.

The same rollup is also blind to `excludedTransactions`, which is filtered client-side. `AnalyzeCommand` subtracts excluded budgeted spending from `budgetSpent` so both sides describe the same set of transactions.

**It is blind to account scope too, and that is not corrected today.** `BudgetService.getBudgetExpenseInsights` calls `insightExpenseBudget(start, end)` with no account filter, so the endpoint totals each budget across every account. A withdrawal from an `untrackedAccounts` entry that carries a `budget_id` therefore lands in `budgetSpent` and is charged to the envelope, despite its account being outside it. No savings withdrawal carries a budget today, and `categorize` is the likely way one would acquire one. Symptom: spending inside the net that appears in no bucket you can find, and not in Untracked Spending either. Workaround: clear the budget in Firefly. **Real fix, if this ever bites:** the SDK signature is `insightExpenseBudget(start, end, xTraceId?, budgetsArray?, accountsArray?)` — passing the derived expense sources as `accountsArray` would scope the rollup like every other bucket. Doing so would also shift `budgetSurplus` and the `budgetRollupCorrection` inputs, so it needs its own verification pass.

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
