# Changelog

All notable changes to this project are documented here.

## 10.0.0

Rebuilds classification around **`RULES.md`**, a single source of truth for
what the tool counts, settled with the owner concept by concept. Every
transaction is now classified once, and every figure in `analyze` and `report`
is a total over the same buckets, so the two commands cannot disagree.

### Breaking

- **The account decides scope first.** A budget, bill link or tag no longer
  pulls a transaction from an outside account into the net (R-SCOPE-2).
  **Migration:** list every account outside the envelope in
  `untrackedAccounts` — savings, any brokerage, and the disposable pool.
  Unquoted numeric ids are read as strings.
- **Closed accounts stay in the envelope** (R-SCOPE-1), so closing a card no
  longer rewrites the months it was used.
- **Bills are expected from their own schedule** (R-BILL-1). Firefly's
  `pay_dates` drops occurrences already paid, so a weekly bill half paid was
  expected at half its amount, and a late payment for last month hid this
  month's bill. `pay_dates` now drives only the not-yet-due amount.
- **Transfers out of the envelope are unbudgeted spending** (R-XFER-3), for
  example checking → savings. Transfers inside the envelope (card payments) and
  into it (top-ups) are still ignored.
- **Income lands only in a non-card envelope account (checking)** (R-INCOME-1).
  Pool and savings interest are never income. Unmarked card credits now reduce
  unbudgeted spending (R-REFUND-1).
- **Budget spent is computed locally** from the budget bucket (R-BUDGET-1). The
  Firefly insight rollup and its correction (`Budget Rollup Adj`, the
  overlap warning) are gone; a bill or disposable purchase that also carries a
  budget is simply charged once, to the bill or the pool.
- **Untracked Spending removed** from `report`. Top expenses now list envelope
  spending only.
- **Six config keys removed:** `incomeDestinationAccounts`,
  `expenseSourceAccounts`, `paycheckDestinationAccounts`, `expenseTransfers`,
  `excludedAdditionalIncomePatterns`, `excludeDisposableIncome`.
  `untrackedAccounts` is now the only account setting. Old keys get no special
  handling; they are reported as unknown settings. The rename warnings for
  `disposableIncomeAccounts` and `firefly` from 9.0.0 are gone too.
- **`--json` is `schemaVersion: 2`**: `budgetRollup` (analyze) and
  `untrackedSpending` (report) are removed.

### Fixed

- `categorize` no longer deletes the other splits of a multi-split
  transaction; `--mode category` no longer writes budgets; an auth or
  bad-request error from the AI aborts the run, and a failed Firefly write is
  reported as failed instead of vanishing.
- `split` divides a foreign amount in proportion instead of leaving all of it
  on the first part.
- `report`: a budget with no limit reads "no limit" instead of counting its
  spending as money left; refunds keep their minus sign; an inactive budget
  with spending or a limit gets a row, and allocations sum every limit, so
  `report` and `analyze` totals agree.
- Float noise no longer renders as `-$0.00 ⚠`; category emoji match whole
  words ("Healthcare" is no longer a car).

### Added

- `RULES.md`, and a meta test that fails if any rule is not named by a test or a
  test names a rule that no longer exists.
- V20 in `test-harness/VERIFICATION.md`: Firefly 6.6.6 drops a bill link on a
  transfer, as it drops a budget.

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
