# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Running

- `npm run compile` - Compile TypeScript to JavaScript in `/dist`
- `npm start -- [command] [options]` - Run in development mode with ts-node
- `./budget.sh [command] [options]` - Run compiled CLI (production mode)

### Docker Development

- See `DOCKER.md` for Docker environment setup
- Docker uses `.env.dev` for environment configuration
- `npm run start:dev -- [command]` - Run with Docker environment (loads `.env.dev`)
- Or use `npm start` if `.env` is symlinked to `.env.dev`

### Testing

- `npm test` - Run all tests
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:watch` - Run tests in watch mode
- Jest config: Tests are in `__tests__/` directories, pattern `**/*.test.ts`

### Code Quality

- `npm run linter` - Run ESLint and Prettier (lint + format)
- ESLint config: `eslint.config.mts` with TypeScript, Node.js globals, and Prettier integration
- Prettier integration for consistent code formatting

## Configuration System

This project uses a dual configuration system:

### YAML Configuration (`budgeting-toolkit.config.yaml`)

Primary configuration file loaded via `src/utils/config-loader.ts`:

- `expectedMonthlyPaycheck` - Expected monthly paycheck amount for surplus calculations
- `validDestinationAccounts` / `validExpenseAccounts` - Account IDs for filtering transactions
- `excludedAdditionalIncomePatterns` - Transaction descriptions to exclude (e.g., "PAYROLL")
- `excludedTransactionsCsv` - Path to CSV file with globally excluded transactions
- `excludeDisposableIncome` - Whether to exclude disposable income transactions

### Environment Variables (`.env`)

Fallback configuration loaded via `src/config.ts`:

- `FIREFLY_API_URL` - Firefly III API endpoint
- `FIREFLY_API_TOKEN` - API authentication token
- `ANTHROPIC_API_KEY` - Claude AI API key
- `LLM_MODEL` - Claude model version
- `LOG_LEVEL` - Logging level (trace, debug, info, warn, error, silent)
- Certificate paths: `CLIENT_CERT_CA_PATH`, `CLIENT_CERT_PATH`, `CLIENT_CERT_PASSWORD`

**Important**: The YAML config takes precedence over environment variables via `getConfigValue()` function.

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
- `ExcludedTransactionService` - Manages transaction exclusions via CSV
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

Services are created and wired together in `ServiceFactory.createServices()`. The factory pattern ensures consistent service instantiation and dependency injection.

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

- `src/utils/config-loader.ts` - YAML config loader with caching
- `src/config.ts` - Environment variable config with YAML fallbacks
- Always use `getConfigValue()` for new config options

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
