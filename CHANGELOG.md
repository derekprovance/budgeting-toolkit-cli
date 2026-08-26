# Changelog

All notable changes to this project are documented here.

## 9.0.0

Redefines what counts as income and spending around an **account boundary**
derived from Firefly, replacing several hand-maintained lists. Read "Upgrading
from 8.x" before running this version — an existing `config.yaml` may refuse to
start.

### Breaking

- **`disposableIncomeAccounts` removed**, replaced by **`untrackedAccounts`**.
  The new setting is symmetric: deposits to an untracked account are not income
  **and** withdrawals from it are not spending. Excluding one side but not the
  other manufactures a deficit that never happened.
- **Amount-only `excludedTransactions` rules are rejected at startup.**
  `description` is now required. Exclusion is applied at fetch time, so a match
  removes the transaction from every bucket in every command — a rule with no
  description would silently drop every transaction of that amount, on any
  account, in either direction. A malformed `amount` is rejected for the same
  reason.
- **`firefly.noNameExpenseAccountId` removed.** It was fully plumbed and
  documented but never read by any code path.
- **Four `llm.*` settings removed:** `temperature`, `retryDelayMs`,
  `maxRetryDelayMs`, and `circuitBreaker.halfOpenTimeout`. Retries are owned
  entirely by the Anthropic SDK, which honours `retry-after`.
- **Node 26 is required** (`engines: 26.x`).

### Added

- **`paycheckDestinationAccounts`** — constrains the `Paycheck` tag by
  destination, so a stray tag on the savings half of a split payroll cannot
  inflate paycheck income.
- Account scope is **derived** from Firefly account roles.
  `incomeDestinationAccounts` and `expenseSourceAccounts` remain as overrides
  that disable derivation entirely; leave them empty unless a Firefly
  `account_role` is wrong.
- **Untracked Spending** section in `report` — withdrawals charged to no bucket,
  shown as a diagnostic and deliberately outside the net, so spending funded from
  outside the envelope stays visible instead of disappearing.
- Startup validation for `excludedTransactions`, with one indexed error per bad
  rule.
- Warnings for unknown, renamed, and removed `config.yaml` keys.

### Fixed

- **Configuration errors were never printed.** The CLI filtered them with a
  pattern that could not match, so every failure showed "Configuration validation
  failed" with no reason — including missing `FIREFLY_API_URL` /
  `FIREFLY_API_TOKEN`.
- **Amount-sign bug.** Firefly returns transaction `amount` unsigned, with
  direction in `type`. Totals over mixed sets now use signed helpers, so a refund
  reduces its bucket instead of inflating it.
- **`difference_float` handling in the `report` path.** It is negative per
  budget and is now negated once at the source rather than `Math.abs`'d per
  budget, which counted a refund as spending whenever a budget's refunds exceeded
  its outflows.
- **`netImpact` double-counting**, and a budget-rollup correction for bill and
  disposable transactions that also carry a budget.
- Budgets with **no limit** for the month are no longer reported as "over budget"
  at 0% used.
- **Days remaining** excluded today, dividing the remaining budget by one day too
  few and reporting "budget exhausted" on the last day of the month.
- Disposable income is stated as an action outside the net, and a refund-heavy
  month is no longer indistinguishable from a spending one.
- AI assignment and the disposable breakdown no longer fail silently.

### Upgrading from 8.x

Start the tool once. It names every setting that needs attention:

```
⚠️  config.yaml: 'disposableIncomeAccounts' is no longer used — it was replaced
    by 'untrackedAccounts'. Its value is being ignored; move it to
    'untrackedAccounts' to restore the behaviour.
⚠️  config.yaml: 'firefly' has been removed — the only key it held,
    'noNameExpenseAccountId', was never read by any code path. It is safe to
    delete from your config.
```

Then:

1. **Rename `disposableIncomeAccounts` → `untrackedAccounts`**, and check the
   membership. This list now controls both sides of the boundary, so it should
   hold every account whose money is outside your cost-of-living envelope —
   typically savings, plus any brokerage whose `savingAsset` role Firefly cannot
   distinguish from an ordinary savings account.
2. **Empty `incomeDestinationAccounts` and `expenseSourceAccounts`** unless you
   are deliberately overriding a wrong Firefly `account_role`. Non-empty disables
   derivation for that side.
3. **Set `paycheckDestinationAccounts`** to your checking account if payroll is
   split across accounts. This is the only thing scoping the paycheck bucket.
4. **Delete `firefly:` and the removed `llm.*` keys.** They do nothing.
5. **Give every `excludedTransactions` rule a `description`.** An amount-only
   rule now fails startup with an indexed error naming the offending entry.

Removing a key is always safe — the tool warns and ignores it. The one change
that will stop startup is an amount-only exclusion rule.
