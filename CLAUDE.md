# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Running

- `npm run compile` - Compile TypeScript to JavaScript in `/dist`
- `./budget.sh [command] [options]` - Run the CLI (requires compilation first)
- `npm start -- [command] [options]` - Run in development mode with ts-node

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

1. **finalize-budget** - Calculates budget finalization report including:
    - Additional income (deposits not from payroll)
    - Unbudgeted expenses (bills/expenses not in budget)
    - Paycheck surplus (actual vs expected paycheck amounts)

2. **budget-status** - Shows current budget status for a given month

3. **update-transactions** - Uses Claude AI to automatically categorize and budget transactions

### Service Layer Architecture

**Core Services** (`src/services/core/`):

- `TransactionService` - Firefly III transaction API operations
- `BudgetService` - Budget API operations
- `CategoryService` - Category API operations
- `TransactionPropertyService` - Transaction classification logic (deposit, bill, transfer, etc.)
- `TransactionValidatorService` - Transaction validation
- `TransactionUpdaterService` - Handles transaction updates with user workflow

**Business Logic Services** (`src/services/`):

- `AdditionalIncomeService` - Finds additional income (non-payroll deposits)
- `UnbudgetedExpenseService` - Finds expenses not covered by budget
- `PaycheckSurplusService` - Calculates paycheck surplus/deficit
- `ExcludedTransactionService` - Manages transaction exclusions via CSV
- `UpdateTransactionService` - Orchestrates AI-powered transaction updates
- `UserInputService` - Handles user interactions, prompts, and multiple-choice inputs

**AI Services** (`src/services/ai/`):

- `LLMTransactionCategoryService` - Claude-powered transaction categorization
- `LLMTransactionBudgetService` - Claude-powered budget assignment
- `LLMTransactionProcessingService` - Orchestrates AI processing
- `LLMResponseValidatorService` - Validates AI responses

**Display Services** (`src/services/display/`):

- Formatters for command output (tables, summaries, etc.)

### Dependency Injection

Services are created and wired together in `ServiceFactory.createServices()`. The factory pattern ensures consistent service instantiation and dependency injection.

### Transaction Classification System

The `TransactionPropertyService` provides the core logic for classifying transactions:

- **Deposits**: `type === "deposit"`
- **Transfers**: `type === "transfer"`
- **Bills**: Transactions tagged with "Bills"
- **Disposable Income**: Transactions tagged with "Disposable Income"
- **Paychecks**: Transactions with "PAYROLL" in description OR category "Paycheck" + source type "Revenue account"

### AI Integration

Claude AI integration through `@anthropic-ai/sdk`:

- Configuration in `src/config/llm.config.ts`
- Batch processing support for multiple transactions
- Validation of AI responses before applying changes
- Dry-run mode for testing AI suggestions

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
- Recent additions: `UserInputService` and `TransactionUpdaterService` integration

### Error Handling

- Structured logging via Pino logger (`src/logger.ts`)
- Services throw descriptive errors with context
- Commands catch and log errors before exiting

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
