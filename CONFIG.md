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
```

### Optional Variables

```bash
# Anthropic Claude API - required ONLY by the categorize command
ANTHROPIC_API_KEY=your_anthropic_api_key

# Logging. Default is `silent`, not `info`.
LOG_LEVEL=info  # Options: trace, debug, info, warn, error, silent

# mTLS Certificate Authentication (optional).
# Leave blank unless you use mTLS: a non-empty path that does not exist fails
# startup validation.
CLIENT_CERT_CA_PATH=
CLIENT_CERT_PATH=
CLIENT_CERT_PASSWORD=

# Force or disable TLS certificate validation. Unset picks an intelligent
# default: enabled when a CA cert is provided, disabled otherwise.
STRICT_TLS=

# Absolute path to a .env file. Highest priority in the .env search order,
# ahead of ./.env and ~/.budget/.env. `npm run start:dev` sets it to .env.dev,
# and the e2e harness to .e2e/env.
ENV_FILE=
```

`ENV_FILE` and the two variables below are read from the **process
environment**, not from a `.env` file:

- `BTK_STRICT_CONFIG=1` disables every fallback: `ENV_FILE` and `--config` must
  both be given and exist, and `./.env`, `~/.budget/.env`, `./config.yaml` and
  `~/.budget/config.yaml` are never read. The test suites always run strict.
- `BTK_PAGE_SIZE` sets the page size requested from Firefly list endpoints,
  1–500 (default 500). An invalid value logs a warning and falls back.

**Notes:**

- The `FIREFLY_API_URL` should not include a trailing slash
- The URL will have `/api` automatically appended
- Certificate paths can be absolute or relative to the project root

## Command-Specific Configuration Requirements

Use this quick reference to see what each command needs:

### `analyze` Command

**Required:**

- `expectedMonthlyPaycheck` - Expected monthly income

**Recommended:**

- `untrackedAccounts[]` - Savings, a brokerage, a disposable pool: everything outside the cost-of-living envelope
- `tags.*` - Custom tag names

---

### `report` Command

**Required:**

- None (works with defaults)

**Recommended:**

- `untrackedAccounts[]` - Same envelope as `analyze`
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

#### How transactions are classified

`RULES.md` is the authority; this is the short version.

1. **The account decides scope.** The envelope is checking and the credit cards:
   every asset account not in `untrackedAccounts`. Nothing outside it
   is counted or shown, whatever it is tagged or budgeted.
2. **Income lands only in checking.** A `Paycheck`-tagged deposit into a
   non-card envelope account is the paycheck; any other unmarked deposit there
   is additional income. Savings deposits, pool interest and card credits are
   never income.
3. **Spending is classified by marker:** bill, then `Disposable Income` tag,
   then budget, else unbudgeted. A transfer out of the envelope (checking →
   savings) is unbudgeted spending; a card payment is ignored.
4. **`excludedTransactions` removes a match from the whole tool.**

#### untrackedAccounts

Accounts outside the cost-of-living envelope. It is the only setting that
draws the envelope: every other asset account (closed ones included) is inside it.

```yaml
untrackedAccounts:
    - '27' # Brokerage - outflows are fund transfers, not spending
    - '2' # Savings - receives the savings half of payroll
    - '39' # Disposable pool - pays for tagged purchases, not the paycheck
```

**Type:** `string[]`
**Default:** `[]`
**Used by:** `analyze`, `report`

Deposits into these accounts are not income, and withdrawals from them are not
spending — both sides move together, so excluding an account can never
manufacture a deficit. Money moving **out of the envelope into** one of them is
spending (unbudgeted): a one-off extra transfer to savings that leaves you short
shows up as the deficit it caused.

Income accounts are derived: the envelope minus accounts with Firefly role
`ccAsset`. A deposit onto a card is a refund, never income. If a card shows up
as income, fix its role in Firefly.

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

| Tag                | Purpose                                   | Used by               |
| ------------------ | ----------------------------------------- | --------------------- |
| `disposableIncome` | Purchases paid for by the disposable pool | `analyze` action line |
| `paycheck`         | The paycheck deposit into checking        | `analyze` paycheck    |

**Notes:**

- Only customize if you use different tag names in your Firefly III instance
- Tag matching is exact (case-sensitive)
- The paycheck tag counts only on a deposit into checking
- Bills are identified by their Firefly III bill linkage (`bill_id` or `subscription_id`), not by tags

#### excludedTransactions

Globally exclude specific transactions from all reports and calculations.

```yaml
excludedTransactions:
    # Match by description only (any amount)
    - description: 'STOCK INVESTMENT'
      reason: 'Investment purchase'

    # Match by description, narrowed to one amount
    - description: 'Monthly Rent'
      amount: '1200.00'
      reason: 'Rent payment'
```

**Type:** `array of {description: string, amount?: string, reason?: string}`
**Default:** `[]`
**Used by:** All commands

**Matching Rules:**

- `description` is **required**, and is matched as **whole-string equality** after
  trimming and lower-casing — not a substring match. `'STOCK INVESTMENT'` does not
  match `'STOCK INVESTMENT 401K'`
- `amount` is optional and narrows a rule to a single amount. Currency formatting
  is accepted (`'$1,200.00'`, `'(1200.00)'`), and the comparison is **numeric on
  absolute value**, so it ignores direction — a $1200 refund matches a $1200 charge
- When `amount` is given, both fields must match
- `reason` is free text for your own benefit; nothing reads it

**Amount-only rules are rejected at startup.** Exclusion is applied at fetch time, so
a match removes the transaction from every bucket in every command. A rule with no
description would drop every transaction of that amount, on any account, in either
direction — the opposite of what this tool is for. A malformed `amount` is rejected
too, rather than silently parsing to something that matches nothing:

```
Configuration validation failed:
  - transactions.excludedTransactions[2]: 'description' is required (amount-only exclusions are not supported)
  - transactions.excludedTransactions[3].amount must be a valid amount (got: twelve hundred)
```

### AI/LLM Configuration

Advanced settings for Claude AI integration.

#### Basic Settings

```yaml
llm:
    model: 'claude-sonnet-5'
    maxTokens: 16000
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

#### Retries

Retries are **not** configurable from YAML. They are owned entirely by the
Anthropic SDK, which applies exponential backoff and honors the `retry-after`
header on rate-limit responses. The attempt count comes from
`api.claude.maxRetries` (default `3`, set in `config.defaults.ts`).

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
```

With no `untrackedAccounts`, every asset account is in the envelope.

### Advanced Configuration

```yaml
# config.yaml (advanced)
expectedMonthlyPaycheck: 5500.00

untrackedAccounts:
    - '27' # Brokerage
    - '2' # Savings
    - '39' # Disposable pool

tags:
    disposableIncome: 'Fun Money'
    paycheck: 'Salary'

excludedTransactions:
    - description: 'STOCK PURCHASE'
      reason: 'Investment'
    - description: 'HSA CONTRIBUTION'
      reason: 'Pre-tax savings'
    - amount: '1200.00'
      description: 'RENT'
      reason: 'Fixed housing cost'

llm:
    model: 'claude-sonnet-5'
    maxTokens: 16000
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
