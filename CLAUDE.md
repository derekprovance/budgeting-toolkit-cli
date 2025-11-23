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
- `npm start -- [command] [options]` - Run in development mode with tsx
- `./budget.sh [command] [options]` - Run compiled CLI (production mode)

### Docker Development

- See `DOCKER.md` for Docker environment setup
- Docker uses `.env.dev` for environment configuration
- `npm run start:dev -- [command]` - Run with Docker environment (loads `.env.dev`)
- Or use `npm start` if `.env` is symlinked to `.env.dev`

### Testing

- `npm test` - Run all tests with ESM configuration
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode
- Jest config: `jest.config.mjs` with ESM support via experimental VM modules
- Test files require: `import { jest } from '@jest/globals'` for mocking

### Code Quality

- `npm run linter` - Run ESLint and Prettier (lint + format)
- ESLint config: `eslint.config.mts` (already ESM) with TypeScript, Node.js globals, and Prettier integration
- Prettier integration for consistent code formatting

## Configuration System

This project uses a unified configuration system managed by `ConfigManager` singleton.

### Configuration Loading Priority

Configuration is loaded with clear precedence (high to low):

1. **YAML Configuration** (`budgeting-toolkit.config.yaml`) - Highest priority
2. **Environment Variables** (`.env`) - Overrides defaults
3. **Code Defaults** (`src/config/config.defaults.ts`) - Lowest priority

### Configuration Manager

The `ConfigManager` singleton (`src/config/config-manager.ts`) provides centralized configuration:

- Loads configuration at startup
- Validates all values with descriptive errors
- Provides strongly-typed configuration access
- Services receive configuration via dependency injection

### YAML Configuration (`budgeting-toolkit.config.yaml`)

**Account Configuration:**

- `validDestinationAccounts` - Array of account IDs for valid income destinations
- `validExpenseAccounts` - Array of account IDs for expense filtering
- `validTransfers` - Array of valid transfer configurations (source/destination pairs)

**Transaction Configuration:**

- `expectedMonthlyPaycheck` - Expected monthly paycheck amount for surplus calculations
- `excludedAdditionalIncomePatterns` - Transaction descriptions to exclude (e.g., "PAYROLL")
- `excludeDisposableIncome` - Whether to exclude disposable income transactions
- `excludedTransactions` - Array of transactions to globally exclude:
    ```yaml
    excludedTransactions:
        - description: 'VANGUARD BUY INVESTMENT'
          amount: '4400.00'
          reason: 'Investment purchase'
        - description: 'Excluded Description Only' # Matches any amount
        - amount: '999.99' # Matches any description
          reason: 'Specific amount to exclude'
    ```

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
- `ANTHROPIC_API_KEY` - Claude AI API key

**Optional:**

- `LOG_LEVEL` - Logging level (trace, debug, info, warn, error, silent)
- `CLIENT_CERT_CA_PATH` - CA certificate path for mTLS
- `CLIENT_CERT_PATH` - Client certificate path for mTLS
- `CLIENT_CERT_PASSWORD` - Certificate password
- `EXPECTED_MONTHLY_PAYCHECK` - Fallback for paycheck amount

### Configuration Files Structure

```
src/config/
├── config-manager.ts         # Singleton configuration manager
├── config.types.ts           # TypeScript type definitions
├── config.defaults.ts        # Default values
├── config.validator.ts       # Validation logic
└── llm.config.ts            # LLM client configuration helper
```

## Architecture Overview

### Command Pattern Architecture

The CLI uses a command pattern with three main commands defined in `src/cli.ts`:

1. **finalize** (alias: `fin`) - Calculates budget finalization report including:
    - Additional income (deposits not from payroll)
    - Unbudgeted expenses (bills/expenses not in budget)
    - Paycheck surplus (actual vs expected paycheck amounts)

2. **report** (alias: `st`) - Shows current budget report for a given month

3. **categorize** (alias: `cat`) - Uses Claude AI to automatically categorize and budget transactions

### Service Layer Architecture

**Core Services** (`src/services/core/`):

- `TransactionService` - Firefly III transaction API operations
- `BudgetService` - Budget API operations
- `CategoryService` - Category API operations
- `TransactionClassificationService` - Transaction classification logic (deposit, bill, transfer, etc.)
- `TransactionValidatorService` - Transaction validation

**Business Logic Services** (`src/services/`):

- `AdditionalIncomeService` - Finds additional income (non-payroll deposits)
- `UnbudgetedExpenseService` - Finds expenses not covered by budget
- `PaycheckSurplusService` - Calculates paycheck surplus/deficit
- `ExcludedTransactionService` - Manages transaction exclusions via YAML configuration
- `AITransactionUpdateOrchestrator` - Orchestrates AI-powered transaction updates
- `InteractiveTransactionUpdater` - Handles transaction updates with interactive user workflow
- `UserInputService` - Handles user interactions, prompts, and multiple-choice inputs

**AI Services** (`src/services/ai/`):

- `LLMAssignmentService` - Unified service for Claude-powered category and budget assignment
- `LLMTransactionProcessingService` - Orchestrates AI processing and coordinates with ClaudeClient
- **AI Utilities** (`src/services/ai/utils/`):
    - `prompt-templates.ts` - Structured prompt generation with function calling schemas
    - `transaction-mapper.ts` - Maps Firefly III transactions to LLM-friendly format

**Display Services** (`src/services/display/`):

- `BaseTransactionDisplayService` - Base service for formatting transaction lists with type indicators
- `BudgetDisplayService` - Formats budget reports with spending visualizations
- `FinalizeBudgetDisplayService` - Formats finalize budget output with recommendations
- `UpdateTransactionDisplayService` - Formats status messages for categorize command

### Dependency Injection

Services are created and wired together in `ServiceFactory.createServices()`. The factory:

- Retrieves configuration from `ConfigManager.getInstance().getConfig()`
- Injects configuration values into service constructors
- Services never load configuration themselves
- Clear dependency graph visible in constructor signatures

### Transaction Classification System

The `TransactionClassificationService` provides the core logic for classifying transactions:

- **Deposits**: `type === "deposit"`
- **Transfers**: `type === "transfer"`
- **Bills**: Transactions tagged with "Bills"
- **Disposable Income**: Transactions tagged with "Disposable Income"
- **Paychecks**: Transactions with "PAYROLL" in description OR category "Paycheck" + source type "Revenue account"

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

### User Interface and Workflow

Enhanced user experience with `@inquirer/prompts`:

- Multiple-choice prompts for transaction updates (approve all, budget only, category only, edit, abort)
- Interactive editing workflow with category and budget selection dropdowns
- Do-while loop implementation for iterative user input
- Hyperlink support for transaction references in terminal output
- Colored output with `chalk` for better readability

## Key Files and Patterns

### Configuration Loading

- `src/config/config-manager.ts` - Unified configuration manager (singleton)
- `src/config/config.types.ts` - Complete type definitions
- `src/config/config.defaults.ts` - Default values
- `src/config/config.validator.ts` - Startup validation
- `src/config.ts` - Re-exports for convenience

**Adding new configuration:**

1. Add type to `config.types.ts`
2. Add default to `config.defaults.ts`
3. Add YAML mapping in `config-manager.ts` (if YAML supported)
4. Add validation in `config.validator.ts` (if needed)
5. Inject value in `ServiceFactory` to services that need it

### Service Creation

- `src/factories/service.factory.ts` - Central service factory
- All services should be instantiated here for consistent DI
- Recent additions: `UserInputService` and `InteractiveTransactionUpdater` integration

### Error Handling

- Structured logging via Pino logger (`src/logger.ts`)
- Services throw descriptive errors with context
- Commands catch and log errors before exiting
- **Error Collection**: `InteractiveTransactionUpdater` collects errors during batch operations
    - Errors are tracked and reported via `getErrors()` method
    - Error statistics are included in update results
    - Users are notified of failed transactions with counts

### Logging Best Practices

- **User-facing output**: Use `console.log/error` for CLI output (reports, summaries, results)
    - This goes to stdout/stderr and can be piped/redirected
    - Clean, formatted output without JSON structure
- **Diagnostic logging**: Use `logger.debug/info/warn/error` for operational diagnostics
    - Structured JSON logs controlled by `LOG_LEVEL` environment variable
    - Includes context objects for troubleshooting
    - Examples: API errors, validation failures, processing statistics

### Transaction Filtering

Services like `AdditionalIncomeService` use a filtering pattern:

1. Get all transactions for month
2. Apply business logic filters (`.filter()` chains)
3. Return filtered results

Follow this pattern for new transaction analysis services.

### User Interaction Patterns

The `UserInputService` provides standardized user interaction patterns:

1. **Transaction Update Workflow**: Uses `expand` prompts for multiple options
2. **Edit Mode**: Uses `checkbox` for selecting what to edit, `select` dropdowns for choices
3. **Do-While Loops**: Implemented for iterative user input until satisfaction
4. **Validation**: Input validation with graceful error handling and retry logic

### Testing

- Comprehensive test coverage in `__tests__/` directories
- Mock Firefly III API responses in test data
- Test both success and error scenarios
- Services are tested independently with mocked dependencies
