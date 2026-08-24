# Configuration Guide

This guide provides comprehensive documentation for all configuration options available in the Budgeting Toolkit CLI.

## Configuration Files

The application uses two configuration files:

1. **`.env`** - Environment variables for secrets and API credentials
2. **`config.yaml`** - Application settings and preferences

## Environment Variables (.env)

### Required Variables

```bash
# Firefly III API Configuration
FIREFLY_API_URL=https://your-firefly-instance.com
FIREFLY_API_TOKEN=your_api_token_here

# Anthropic Claude API (required for AI categorization)
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Optional Variables

```bash
# Logging
LOG_LEVEL=info  # Options: trace, debug, info, warn, error, silent

# mTLS Certificate Authentication (optional)
CLIENT_CERT_CA_PATH=../certs/ca.pem
CLIENT_CERT_PATH=../certs/client.p12
CLIENT_CERT_PASSWORD=your_certificate_password
```

**Notes:**

- The `FIREFLY_API_URL` should not include a trailing slash
- The URL will have `/api` automatically appended
- Certificate paths can be absolute or relative to the project root

## YAML Configuration (config.yaml)

## Command-Specific Configuration Requirements

Use this quick reference to see what each command needs:

### `analyze` Command

**Required:**

- `expectedMonthlyPaycheck` - Expected monthly income

Account scope is derived from Firefly and needs no configuration. See
`untrackedAccounts` below if you hold a brokerage or similar.

**Recommended:**

- `excludedAdditionalIncomePatterns[]` - Exclude patterns like "PAYROLL"
- `excludeDisposableIncome` - true/false
- `tags.*` - Custom tag names

---

### `report` Command

**Required:**

- None (works with defaults)

**Recommended:**

- `firefly.noNameExpenseAccountId` - Verify default '5' matches your setup
- `tags.*` - Custom tag names if you use different tags

---

### `categorize` Command

**Required:**

- `ANTHROPIC_API_KEY` - In .env file

**Recommended:**

- `llm.model` - Claude model to use
- `llm.batchSize` - Transactions per batch (default: 10)
- `llm.maxConcurrent` - Concurrent requests (default: 3)

---

### `split` Command

**Required:**

- Firefly III API credentials only (minimal config)

---

### Budget Settings

#### expectedMonthlyPaycheck

Expected monthly paycheck amount for surplus/deficit calculations.

```yaml
expectedMonthlyPaycheck: 5000.00
```

**Type:** `number`
**Default:** `undefined`
**Used by:** Analyze command

#### Account scope (derived)

Which accounts count as income destinations and expense sources is derived from
Firefly's own `account_role`, so the lists cannot drift out of date as accounts
are added:

```
income destinations = active asset accounts, role != ccAsset, minus untracked
expense sources     = active asset accounts,                  minus untracked
```

Credit cards are excluded from income because deposits to them are refunds and
statement credits, never income. Inactive accounts are excluded from both.

#### untrackedAccounts

Accounts outside the tracked boundary. Money crossing **into** them is spending;
money generated **inside** them is not income.

```yaml
untrackedAccounts:
    - '27' # Brokerage
```

**Type:** `string[]`
**Default:** `[]`
**Used by:** Account scope derivation

This is the one judgement Firefly cannot make for you. A brokerage carries the
same `savingAsset` role as an ordinary savings account, but its outflows are
fund transfers rather than purchases. Listing it here keeps a six-figure
internal rebalance out of your spending total.

Note this does not hide money moving from a tracked account into one — a
withdrawal from checking to buy an investment still counts as spending, which is
correct: that money did leave the tracked world.

#### incomeDestinationAccounts / expenseSourceAccounts (overrides)

Both default to `[]`, which means "derive". Setting either to a non-empty list
replaces derivation entirely **for that side**.

```yaml
expenseSourceAccounts:
    - '1' # Checking Account
    - '4' # Credit Card
```

**Type:** `string[]`
**Default:** `[]` (derive)

Use these only when a Firefly `account_role` is wrong and you would rather not
correct it there. Prefer fixing the role — an override is a second source of
truth that has to be maintained by hand, which is what derivation replaced.

#### expenseTransfers

Transfers that should be counted as unbudgeted expenses.

```yaml
expenseTransfers:
    - source: '5' # Remote Investment Account
      destination: '1' # Checking Account
```

**Type:** `array of {source: string, destination: string}`
**Default:** `[]`
**Used by:** Unbudgeted expense calculations

**Example Use Case:** Tracking investment account withdrawals as expenses.

### Transaction Filtering

#### excludedAdditionalIncomePatterns

Transaction description patterns to exclude from additional income.

```yaml
excludedAdditionalIncomePatterns:
    - 'PAYROLL'
    - 'ATM FEE'
    - 'TRANSFER'
```

**Type:** `string[]`
**Default:** `[]`
**Matching:** Case-insensitive substring matching
**Used by:** Additional income calculations

#### excludeDisposableIncome

Whether to exclude transactions tagged as disposable income from budget analysis reports.

```yaml
excludeDisposableIncome: true
```

**Type:** `boolean`
**Default:** `true`
**Used by:** Additional income calculations

**Use Cases:**

- Set to `true` when you want to exclude personal spending money from budget calculations
- Set to `false` to include all tagged income in reports

#### tags

Custom tag names used to identify special transaction types in Firefly III.

```yaml
tags:
    disposableIncome: 'Fun Money'
    paycheck: 'Salary'
```

**Type:** `object`
**Default:**

```yaml
tags:
    disposableIncome: 'Disposable Income'
    paycheck: 'Paycheck'
```

**Available tags:**

| Tag                | Purpose                            | Used by                       |
| ------------------ | ---------------------------------- | ----------------------------- |
| `disposableIncome` | Identifies personal spending money | Additional income filtering   |
| `paycheck`         | Identifies paycheck transactions   | Paycheck surplus calculations |

**Notes:**

- Only customize if you use different tag names in your Firefly III instance
- Tag matching is exact (case-sensitive)
- Paycheck tag works with any transaction type (deposits, transfers, etc.)
- Bills are identified by their Firefly III bill linkage (`bill_id` or `subscription_id`), not by tags

#### excludedTransactions

Globally exclude specific transactions from all reports and calculations.

```yaml
excludedTransactions:
    # Match by description only (any amount)
    - description: 'STOCK INVESTMENT'
      reason: 'Investment purchase'

    # Match by description and amount (exact match)
    - description: 'Monthly Rent'
      amount: '1200.00'
      reason: 'Rent payment'

    # Match by amount only (any description)
    - amount: '999.99'
      reason: 'Specific amount to exclude'
```

**Type:** `array of {description?: string, amount?: string, reason?: string}`
**Default:** `[]`
**Used by:** All commands

**Matching Rules:**

- At least one field (`description` or `amount`) is required
- `reason` is optional but recommended for documentation
- Description matching is case-insensitive substring matching
- Amount matching is exact string comparison
- Both fields must match if both are provided

### Firefly III Settings

#### noNameExpenseAccountId

ID of the "(no name)" expense account that Firefly III creates automatically.

```yaml
firefly:
    noNameExpenseAccountId: '5'
```

**Type:** `string`
**Default:** `''`
**Used by:** Transaction classification

**How to find:**

1. Go to Firefly III → Accounts
2. Look for "(no name)" in expense accounts
3. Note the account ID from the URL

### AI/LLM Configuration

Advanced settings for Claude AI integration.

#### Basic Settings

```yaml
llm:
    model: 'claude-sonnet-5'
    maxTokens: 1000
    batchSize: 10
    maxConcurrent: 3
```

**Options:**

| Setting         | Type     | Default             | Description                                |
| --------------- | -------- | ------------------- | ------------------------------------------ |
| `model`         | `string` | `'claude-sonnet-5'` | Claude model version to use                |
| `maxTokens`     | `number` | `16000`             | Maximum tokens per API response            |
| `batchSize`     | `number` | `10`                | Number of transactions processed per batch |
| `maxConcurrent` | `number` | `3`                 | Maximum concurrent API requests            |

**Performance Notes:**

- Batch processing reduces API calls by 80-90%
- Lower `maxConcurrent` values prevent rate limiting
- Higher `batchSize` improves efficiency but uses more tokens

#### Retry Configuration

```yaml
llm:
```

**Options:**

| Setting | Type | Default | Description |
| ------- | ---- | ------- | ----------- |

**Behavior:**

- Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s
- Retries on network errors and rate limiting
- Automatic retry with increasing delays

#### Rate Limiting

```yaml
llm:
    rateLimit:
        maxTokensPerMinute: 50000
        refillInterval: 60000
```

**Options:**

| Setting              | Type     | Default | Description                |
| -------------------- | -------- | ------- | -------------------------- |
| `maxTokensPerMinute` | `number` | `50000` | Token budget per minute    |
| `refillInterval`     | `number` | `60000` | Token refill interval (ms) |

**Purpose:**

- Prevents API quota exhaustion
- Smooths out request patterns
- Aligns with Anthropic API rate limits

#### Circuit Breaker

```yaml
llm:
    circuitBreaker:
        failureThreshold: 5
        resetTimeout: 60000
```

**Options:**

| Setting            | Type     | Default | Description                       |
| ------------------ | -------- | ------- | --------------------------------- |
| `failureThreshold` | `number` | `5`     | Failures before opening circuit   |
| `resetTimeout`     | `number` | `60000` | Time before attempting reset (ms) |

**States:**

1. **Closed:** Normal operation
2. **Open:** Failing fast, no requests sent
3. **Half-Open:** Testing if service recovered

**Purpose:**

- Prevents cascading failures
- Automatic recovery detection
- Protects against API outages

## Configuration Priority

Settings are loaded with the following precedence (highest to lowest):

1. **YAML Configuration** (`config.yaml`)
2. **Environment Variables** (`.env`)
3. **Code Defaults** (`src/config/config.defaults.ts`)

## Validation

Configuration is validated at two levels:

**Startup Validation (ConfigValidator):**

- Format validation: URLs are valid, numbers in correct ranges
- Type validation: positive numeric LLM settings, valid log levels
- File existence: Certificate paths if specified
- Firefly API credentials present

**Command-Level Validation:**

- Business requirements: e.g., analyze needs expectedMonthlyPaycheck set
- Command-specific fields: e.g., categorize needs ANTHROPIC_API_KEY
- Runtime validation: Fails when command runs with helpful error messages
- Actionable errors: Shows exactly what to add and where

If validation fails, you'll see:

- Clear error message with the problem
- Specific configuration needed
- Example showing how to add it
- Reference to this documentation

## Examples

### Minimal Configuration

```yaml
# config.yaml (minimal)
expectedMonthlyPaycheck: 5000.00

firefly:
    noNameExpenseAccountId: '5'
```

Account scope is derived, so a minimal config names no accounts at all.

### Advanced Configuration

```yaml
# config.yaml (advanced)
expectedMonthlyPaycheck: 5500.00

untrackedAccounts:
    - '27' # Brokerage - outflows are fund transfers, not spending

paycheckDestinationAccounts:
    - '1' # Only a deposit landing here counts as the paycheck

expenseTransfers:
    - source: '10'
      destination: '1'

excludedAdditionalIncomePatterns:
    - 'ATM FEE'

excludeDisposableIncome: true

tags:
    disposableIncome: 'Fun Money'
    bills: 'Monthly Bills'

excludedTransactions:
    - description: 'STOCK PURCHASE'
      reason: 'Investment'
    - description: 'HSA CONTRIBUTION'
      reason: 'Pre-tax savings'
    - amount: '1200.00'
      description: 'RENT'
      reason: 'Fixed housing cost'

firefly:
    noNameExpenseAccountId: '5'

llm:
    model: 'claude-sonnet-5'
    maxTokens: 2000
    batchSize: 15
    maxConcurrent: 3

    rateLimit:
        maxTokensPerMinute: 40000
        refillInterval: 60000

    circuitBreaker:
        failureThreshold: 5
        resetTimeout: 60000
```

## Troubleshooting

### Configuration Not Loading

**Symptom:** Changes to YAML file don't take effect

**Solutions:**

1. Verify file is named `config.yaml` exactly
2. Check file is in project root directory
3. Verify YAML syntax is valid (use YAML linter)
4. Restart application after changes

### API Authentication Errors

**Symptom:** "Configuration validation failed" errors

**Solutions:**

1. Verify `FIREFLY_API_URL` doesn't have trailing slash
2. Check `FIREFLY_API_TOKEN` is valid and not expired
3. Ensure `ANTHROPIC_API_KEY` is set for AI commands
4. Verify URLs are properly formatted (include protocol)

### Certificate Errors

**Symptom:** Certificate-related validation errors

**Solutions:**

1. Use absolute paths or paths relative to project root
2. Verify certificate files exist at specified paths
3. Check certificate password is correct
4. Ensure `.p12` file is not corrupted

### AI Processing Issues

**Symptom:** Rate limiting or timeout errors

**Solutions:**

1. Lower `maxConcurrent` value (try `1` or `2`)
2. Reduce `batchSize` (try `5`)
3. Increase rate limit settings if you have higher API quota
4. Check Anthropic API status page

## See Also

- [README.md](README.md) - Quick start guide
- [CLAUDE.md](CLAUDE.md) - Architecture and development guide
- [DOCKER.md](DOCKER.md) - Docker development setup
