# Classification Rules

**This file is the single source of truth for what the tool counts and why.**
It wins over the code, CLAUDE.md, and any agent memory. Where the code
disagrees, the code is wrong.

Changing a rule requires the user's explicit approval, recorded as a dated entry
in the [Changelog](#changelog). Every rule id below must be referenced by at
least one test name (e.g. `[R-XFER-1] ignores a card payment`); a meta test
enforces this, so a rule cannot change without a visible test change.

Prefer fewer rules. Every extra rule is another place for a transaction to fall
between buckets.

## Purpose

### R-PURPOSE-1: one envelope, cost of living

The tool measures living-expense spending each month against the envelope the
user pays themselves into checking.

```
Net Cash Flow = income into checking − spending dated this month on envelope accounts
```

It is deliberately **not** a household cash-flow statement. Money outside the
envelope never appears in the net.

## Accounts

### R-SCOPE-1: two account classes; the account decides scope first

| Class        | Accounts                                                                             |
| ------------ | ------------------------------------------------------------------------------------ |
| **Envelope** | Every asset account not in `untrackedAccounts`: checking and the credit cards        |
| **Outside**  | Every account in `untrackedAccounts`: savings, the brokerage and the disposable pool |

`untrackedAccounts` is the only setting that draws this line. Savings, the
brokerage and the pool behave identically: there is no third class.

Closing an account does not move it. A closed card's past purchases still
count in the months they happened, and past payments to it are still
transfers inside the envelope.

### R-SCOPE-2: markers only pick a bucket inside the envelope

A budget, bill link or tag never pulls an outside transaction into the net.

- _Example:_ a budgeted withdrawal from savings is not counted anywhere.

## Income

### R-INCOME-1: income lands only in checking

Income is a **deposit** into an envelope account that is not a credit card
(Firefly role `ccAsset`), which means checking.

- **Paycheck**: a deposit carrying the `Paycheck` tag. The tag wins over any
  other marker on the same deposit.
- **Additional income**: any other unmarked deposit into checking. Examples:
  freelance pay, Stripe or Venmo reimbursements.

### R-INCOME-2: nothing else is income

These are never income:

- the savings half of payroll, even when it carries a stray `Paycheck` tag
- savings interest and pool interest
- card credits (see R-REFUND-1)
- any transfer

- _Example:_ payroll arrives as two deposits with identical descriptions. The
  checking half is the paycheck. The savings half is counted nowhere.

## Transfers

### R-XFER-1: transfers inside the envelope are ignored

- _Example:_ checking → card payment. The card purchases are the spending;
  counting the payment would charge them twice.

### R-XFER-2: transfers into the envelope are ignored

- _Example:_ a savings → checking top-up is not income. Counting it would mask
  the overspend it covered.
- _Example:_ a pool → checking reimbursement for disposable purchases.

### R-XFER-3: transfers out of the envelope are unbudgeted spending

A transfer from an envelope account to any account outside the envelope is
unbudgeted spending, whatever it carries. Firefly keeps neither a bill link nor a budget
on a transfer, so no marker can classify one.

- _Example:_ a $250 monthly "car payment" from checking to savings is
  unbudgeted. It reduces the net exactly as a bill would. It has no Firefly
  bill, because one could never be linked to it.
- _Example:_ a one-off $100 extra to savings that causes a deficit is
  unbudgeted, so the deficit is visible.
- _Example:_ a checking → pool top-up.

## Spending

### R-BUCKET-1: every envelope withdrawal lands in exactly one bucket

A withdrawal from an envelope account is classified by its markers, and the
first match wins:

1. **Bill**: linked to a Firefly bill or subscription.
2. **Disposable**: tagged `Disposable Income` (see R-DISP-1).
3. **Budgeted**: carries a budget.
4. **Unbudgeted**: everything else.

### R-BILL-1: bills are charged at what was actually paid

- A bill not yet paid this month contributes $0 to the net.
- The expected amount (`amount_avg`, a levelled average) is display-only, for
  predicted and outstanding figures.
- Actual differing from the average is by design, not an error.

### R-BUDGET-1: budgeted spending is actual spent, computed locally

Budgeted spending is computed from the same transaction list as every other
bucket, so it respects scope and exclusions. Firefly supplies only the
allocations, which feed a display-only budget surplus (allocated − spent).

### R-DISP-1: disposable purchases are shown, not netted

Tagged purchases are paid for by the disposable pool, not the paycheck.

- They are **not** subtracted from Net Cash Flow.
- The report states their total just below the net as an action:
  `→ Transfer from disposable pool: $X`.
- The total is net of refunds and not floored at zero. A negative total inverts
  the instruction rather than printing a negative transfer.

## Refunds

### R-REFUND-1: refunds reduce the bucket they belong to

| Deposit into an envelope account     | Effect                         |
| ------------------------------------ | ------------------------------ |
| Carries a marker (bill, tag, budget) | Reduces that marker's bucket   |
| Unmarked, into checking              | Additional income (R-INCOME-1) |
| Unmarked, onto a card                | Reduces unbudgeted spending    |

- _Example:_ a $25 return of a budgeted grocery purchase reduces
  **unbudgeted** spending, not Groceries. Firefly silently drops a budget on a
  deposit, so a refund can never carry one. Accepted: the net is still right.

## Timing

### R-TIME-1: transactions count in the month they are dated

- _Example:_ a card purchase on the 28th counts this month, even though checking
  pays the card next month.

## Exclusions

### R-EXCL-1: an excluded transaction is gone from the whole tool

- A transaction matching `excludedTransactions` is removed once, at fetch time.
- It appears in no bucket, total or list in any command.
- There are no downstream exclusion checks.

## Not in scope

- **Activity in outside accounts is not shown.** There is no "Untracked
  Spending" section.
- **A bill paid from an outside account** is fixed in Firefly (deactivate the
  bill, or pay it from an envelope account). The tool gets no special case for
  it.
    - _Example:_ Starry, currently paid from the pool.

## Changelog

- **2026-09-25**: R-SCOPE-1: inactive accounts stay in the envelope. Closing a
  card used to rewrite history, dropping its past purchases and turning past
  payments to it into outbound transfers. Also clarified wording: "tag" in
  R-REFUND-1 means the `Disposable Income` tag, the `Paycheck` tag wins over
  other markers, and R-XFER-3 covers any destination outside the envelope.

- **2026-09-25**: R-XFER-3 no longer classifies outbound transfers by marker.
  Verified against Firefly 6.6.6: a bill link on a transfer is silently
  dropped on create and on update. Every outbound transfer is unbudgeted.
- **2026-09-25**: Removed `excludedAdditionalIncomePatterns`. Every unmarked
  deposit into checking is income; `excludedTransactions` handles the rare
  exception. Documented that budgeted refunds reduce unbudgeted (R-REFUND-1).
- **2026-09-25**: Rules established in a concept-by-concept review with the
  user. They replace the earlier "markers first" model: the account now decides
  scope, and markers only pick the bucket.
