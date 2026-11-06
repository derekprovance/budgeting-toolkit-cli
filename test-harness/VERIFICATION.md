# Phase 0 verification: observed Firefly III behavior

These checks ran against the pinned e2e stack (`docker-compose.e2e.yml`) on 2026-09-25. Every request went to `127.0.0.1:<ephemeral>` using a token that `scripts/e2e/up.sh` created. The throwaway data was destroyed with `npm run e2e:down`.

These are observations of Firefly's own server behavior. Anything the harness relies on belongs as a literal in `test-harness/scenario/firefly-contract.ts`, with this file cited as the evidence.

## Summary

| #   | Question                                               | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Tag / digest / version                                 | `fireflyiii/core:version-6.6.6@sha256:ae69fdd9…0e972`; `/api/v1/about` → `version 6.6.6`, `api_version 6.6.6`, php 8.5.7, driver pgsql                                                                                                                                                                                                                                                                                                              |
| V2  | pg18 data path                                         | `PGDATA=/var/lib/postgresql/18/docker`. The image declares `VOLUME /var/lib/postgresql`, so mount there, not at `…/data`                                                                                                                                                                                                                                                                                                                            |
| V3  | First user                                             | `php artisan system:create-first-user {email}`. It **refuses unless `app.env === 'testing'`**                                                                                                                                                                                                                                                                                                                                                       |
| V4  | Token                                                  | No `tinker` in the image. A `php` stdin bootstrap works: `User->createToken('btk-e2e')->accessToken`. A fresh install has **zero** oauth clients, so run `passport:client --personal --provider=users` first                                                                                                                                                                                                                                        |
| V5  | curl, `/health`                                        | `/usr/bin/curl` (8.14.1) is present. `GET /health` → `200 OK` (body `OK`), no auth needed                                                                                                                                                                                                                                                                                                                                                           |
| V6  | ccAsset fields                                         | `credit_card_type` **and** `monthly_payment_date` are both required (422 otherwise). The role persists, but both fields **read back as `null`**                                                                                                                                                                                                                                                                                                     |
| V7  | Transfer with no destination                           | **Rejected, 422** (`[c] Need to get a valid destination account ID and/or valid destination account name`). A transfer to an unknown destination name is also rejected                                                                                                                                                                                                                                                                              |
| V8  | `budget_id` on a deposit or transfer                   | **Silently dropped.** 200, and `budget_id: null` in the response and on readback, for POST and for PUT                                                                                                                                                                                                                                                                                                                                              |
| V9  | `/v1/insight/expense/budget` (unused since R-BUDGET-1) | Covers withdrawals from **every** account: tracked, savings, and inactive alike. It **honors `accounts[]`**. `difference_float` is **negative** (`-139`), and `difference` is a string (`"-139.000000000000"`)                                                                                                                                                                                                                                      |
| V10 | `/v1/budgets/transactions-without-budget` (unused)     | Returns **withdrawals only**: no transfers and no deposits. Inactive-account withdrawals are included. **No KD-3**                                                                                                                                                                                                                                                                                                                                  |
| V11 | Bills with `start`/`end`                               | Every monthly bill, **inactive included** (`active:false`), has non-empty `pay_dates`. **But once a bill is paid in the window, `pay_dates` shows the _next_ occurrence** (outside the window). `amount_avg` is present and equals `(min+max)/2`. `paid_dates[]` carries `transaction_journal_id`. Without `start`/`end`, `pay_dates` is `[]`                                                                                                       |
| V12 | Deposit with no source                                 | **Not `(no name)`.** The source becomes `Cash account` (type `Cash account`). Passing `source_name: "(no name)"` creates or reuses a **Revenue account** called `(no name)`, which is what real data looks like                                                                                                                                                                                                                                     |
| V13 | Primary currency                                       | A fresh install is **EUR** (id 1), the only enabled currency. `POST /v1/currencies/USD/primary` with body `{}` → 200 and USD becomes primary; it **auto-enables** USD. Without a JSON body/Content-Type → 415. SDK method: `primaryCurrency(...)`                                                                                                                                                                                                   |
| V14 | `limit` / pagination                                   | `limit=3` → `per_page 3`, `total_pages 5` for 13 groups, and page 5 has 1 row. Default `per_page` is 50. **`limit=1000` was accepted as `per_page 1000`: no server cap was observed**                                                                                                                                                                                                                                                               |
| V15 | `/v1/accounts?type=asset`                              | **Lists inactive accounts** with `active: false`. `active=true` is **not** a filter; the inactive account was still returned                                                                                                                                                                                                                                                                                                                        |
| V16 | End date                                               | **Inclusive** at both ends: a 2025-01-31 transaction is in `end=2025-01-31`; 2024-12-31 and 2025-02-01 are out. `start=end=2025-01-31` returns only that day                                                                                                                                                                                                                                                                                        |
| V17 | `up --wait`                                            | Works; both containers report Healthy. A cold `npm run e2e:up`, bootstrap included, takes about 9s                                                                                                                                                                                                                                                                                                                                                  |
| V19 | Store against inactive bill or account                 | **Both accepted (200).** A withdrawal from a deactivated account and one linked to a deactivated bill both persist, and `bill_id` is kept                                                                                                                                                                                                                                                                                                           |
| V20 | `bill_id` on a transfer                                | **Silently dropped** on POST and on PUT (`bill_id` and `subscription_id` read back `null`). A withdrawal keeps it. So a transfer can carry no marker but tags (R-XFER-3)                                                                                                                                                                                                                                                                            |
| V21 | Bill schedule and payment-aware `pay_dates`            | Occurrences step from `date` every (skip + 1) periods; a month-end day clamps without drifting (Jan 31 → Feb 28 → Mar 31). `pay_dates` lists only occurrences after the latest payment in the window: a weekly bill with 2 of 4 paid reports 2 dates, all paid reports next month's. A late payment for last month (Jan 2) leaves this month's date (Jan 25) listed. An unpaid bill with nothing due in the window reports its next date outside it |
| V23 | `GET /v1/tags/{tag}` for an unknown tag                | **404** `{"message":"Resource not found","exception":"NotFoundHttpException"}`, by name or by id. An existing tag by name → 200; a bad token → 401. So only a 404 means the tag is absent                                                                                                                                                                                                                                                           |
| V22 | PUT on a multi-split group                             | Every split the PUT does not list is **deleted**. Listing a split by `transaction_journal_id` alone leaves its fields unchanged. A PUT naming more than one split is rejected (422) without `group_title`                                                                                                                                                                                                                                           |
| —   | `apply_rules` / `fire_webhooks`                        | Accepted, as is `error_if_duplicate_hash`. They are validated as booleans (`"nope"` → 422)                                                                                                                                                                                                                                                                                                                                                          |
| —   | Group vs journal id                                    | Distinct sequences. A group's `data.id` is the group id; each split carries `transaction_journal_id`. For a single split the two happened to match (1/1). A 2-split group had id `19` with journals `["20","19"]`: **splits came back in reverse order**                                                                                                                                                                                            |
| —   | Amount shape                                           | `amount` is an unsigned string with 12 decimals (`"1000.000000000000"`). Dates look like `2025-01-01T00:00:00+00:00`                                                                                                                                                                                                                                                                                                                                |

## Evidence

### V1: image and version

```
$ docker buildx imagetools inspect fireflyiii/core:version-6.6.6
Digest:    sha256:ae69fdd95cdef9038cd7a460a5aec731f14813973e4f096511d5a4ea9ff0e972
$ docker buildx imagetools inspect postgres:18.6-alpine      # == 18-alpine today
Digest:    sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873
$ docker buildx imagetools inspect fireflyiii/data-importer:version-2.3.5   # == latest today
Digest:    sha256:2627644321afdcb52b49b258126bfe98312c2f93a709cc3a07c90327854e6aa2

GET /api/v1/about
{"data":{"version":"6.6.6","api_version":"6.6.6","php_version":"8.5.7","os":"Linux","driver":"pgsql"}}
```

Available 6.6.x core tags: 6.6.0–6.6.4 and 6.6.6. There is no 6.6.5 tag.

### V2: postgres data path

```
image Env:   PGDATA=/var/lib/postgresql/18/docker
image Volume: {"/var/lib/postgresql":{}}
in container: show data_directory → /var/lib/postgresql/18/docker
/proc/mounts: tmpfs /var/lib/postgresql tmpfs rw,nosuid,nodev,noexec,relatime
```

### V3/V4: user and token

```
app/Console/Commands/System/CreatesFirstUser.php
  protected $signature = 'system:create-first-user {email}';
  if ('testing' !== config('app.env')) { friendlyError('This command only works in the testing environment.'); return 1; }

$ php artisan tinker → Command "tinker" is not defined.
oauth_clients on a fresh install: []   laravel/passport v13.7.5
```

up.sh pipes a PHP script to `docker compose exec -T firefly php`. The script boots the Laravel kernel, calls `config(['app.env' => 'testing'])` for that process only, and then runs `Artisan::call('system:create-first-user', …)`. The web container therefore stays on `APP_ENV=local`: `testing` would also disable `CacheProperties` and the installer middleware.

The script then runs `Artisan::call('passport:client', ['--personal', '--provider' => 'users'])` if no personal client exists, and finally `createToken()`. Firefly logs to stdout, so the token is printed on a `BTK_E2E_TOKEN=` marker line. It must be computed **before** that `echo`, or log lines interleave with it.

Smoke check: `GET /api/v1/about/user` → `{"email":"e2e@btk.invalid","role":"owner",…}`.

### V6: ccAsset

```
POST /v1/accounts {"name":"CC0","type":"asset","account_role":"ccAsset"}
422 {"credit_card_type":["…required when account role is ccAsset."],
     "monthly_payment_date":["…required when account role is ccAsset."]}
POST … + "credit_card_type":"monthlyFull","monthly_payment_date":"2025-01-15" → 200
GET /v1/accounts/1 → account_role ccAsset, credit_card_type null, monthly_payment_date null, currency_code USD
```

### V7: transfer with no destination

```
POST transfer {source_id: CHK} (no destination) → 422
  "transactions.0.destination_id": ["[c] Need to get a valid destination account ID and/or valid destination account name to continue."]
POST transfer {source_id: CHK, destination_name: "Nowhere"} → 422 "Could not find a valid destination account…"
```

A destination-less transfer therefore cannot come from the API. It stays a unit-only case, as the plan assumed.

### V8: budget on a deposit or transfer

```
POST deposit  {…, budget_id: 1} → 200, response budget_id null, GET readback null
POST transfer {CHK→SAV, budget_id: 1} → 200, response budget_id null, GET readback null
PUT  /v1/transactions/1 {transaction_journal_id: 1, budget_id: 1} (a deposit) → 200, budget_id null
```

A budgeted refund cannot be seeded, and the seeder's read-back step must not expect a budget on non-withdrawals.

### V9: budget rollup

Setup: budgeted withdrawals CHK 10 (01-01), SAV 100, OLD 22, CC 7 (01-31). Out of range: CC 1000 (02-01), CC 3 (2024-12-31).

```
GET /v1/insight/expense/budget?start=2025-01-01&end=2025-01-31
  [{"id":"1","name":"Groceries","difference":"-139.000000000000","difference_float":-139,"currency_code":"USD"}]
  &accounts[]=CC&accounts[]=CHK → difference_float -17
  &accounts[]=SAV              → difference_float -100
after PUT /v1/accounts/OLD {active:false} → still -139
```

The rollup covers untracked (SAV) and inactive (OLD) accounts. It honors `accounts[]`. Its date range is inclusive. It is blind to client-side `excludedTransactions` by construction, since the server never sees them.

### V10: without-budget endpoint

January data at query time included: deposits (1000 payroll, 5, 5, a 20 "budgeted" refund whose budget was dropped), a CHK→SAV transfer of 200, and unbudgeted withdrawals CHK 9, SAV 250, OLD 5, and OLD 1 (after deactivation).

```
GET /v1/budgets/transactions-without-budget?start=2025-01-01&end=2025-01-31
  withdrawal "onto inactive acct" 1 OLD
  withdrawal "old unbudgeted"     5 OLD
  withdrawal "sav IRS"          250 SAV
  withdrawal "chk unbudgeted"     9 CHK
  meta.pagination.total 4
```

src no longer calls this endpoint (Untracked Spending was removed in 10.0.0).

### V11: bills

Bills anchored at `date 2024-12-05`, `repeat_freq monthly`: Electric (100/100), Range (90/110), Old Gym (40/40, deactivated after being paid).

```
GET /v1/bills?start=2025-01-01&end=2025-01-31
  Electric active=true  amount_avg 100.00 pay_dates [2025-02-05] paid_dates [(2025-01-06, journal 16)]
  Range    active=true  amount_avg 100.00 pay_dates [2025-01-05] paid_dates []
  Old Gym  active=false amount_avg 40.00  pay_dates [2025-02-05] paid_dates [(01-07, 17), (01-08, 18)]
GET /v1/bills (no range) → pay_dates [] for all
```

`pay_dates` is non-empty for every monthly bill in a ranged query, including inactive ones. However, a bill already paid in the window reports its **next** date (2025-02-05), which falls outside the requested month. Code that checks only "non-empty" is fine. Code that checks "a date inside the month" would treat a paid bill as not due. `BillComparisonService` has a comment about exactly this (line ~315).

### V12: `(no name)`

```
deposit, no source         → source_name "Cash account", source_type "Cash account"
deposit, source_name ""    → "Cash account"
deposit, source_name "(no name)" → source_type "Revenue account", GET ?type=revenue → [("6","(no name)")]
```

### V13: primary currency

```
fresh: GET /v1/currencies/primary → EUR (id 1, primary, enabled); enabled list: [EUR]
POST /v1/currencies/USD/primary (no body)      → 415 "Content-Type header cannot be empty."
POST /v1/currencies/USD/primary  body {}       → 200, USD primary+enabled
Accounts created afterwards get currency_code USD.
```

### V14: pagination

```
GET /v1/transactions?start…&end…&limit=3        → count 3, per_page 3, total 13, total_pages 5
                                  &limit=3&page=5 → count 1, current_page 5
                                  &limit=1000     → count 13, per_page 1000
                                  (no limit)      → per_page 50
```

This instance does not cap `limit`. If the fake server caps page size, the cap is a modelling choice, not observed 6.6.6 behavior.

### V15: inactive accounts

```
GET /v1/accounts?type=asset → [(1,CC,true,ccAsset),(2,CHK,true,defaultAsset),(3,SAV,true,savingAsset),(4,OLD,false,defaultAsset)]
GET /v1/accounts?type=asset&active=true → OLD still listed with active false
```

### V17: compose `--wait`

`docker compose -f docker-compose.e2e.yml up -d --wait` returns once both containers are Healthy (pg_isready every 2s; Firefly `curl -fsS /health` every 5s). A cold start takes about 8–9s on this machine.

### V19: inactive references

```
POST withdrawal source_id OLD (inactive)             → 200
POST withdrawal bill_id Old Gym (inactive), 2025-01-08 → 200, bill_id "2" persisted
```

The seeder can therefore deactivate either before or after storing its transactions.

## Bootstrap lifecycle checks

- A cold `rm -rf .e2e && npm run e2e:up` succeeded: it generated the key, created the user, created the token, wrote `.e2e/env` (mode 600) and `state.json`, and passed the smoke check.
- A rerun against the running stack succeeded and reused the token.
- `e2e:down` followed by `e2e:up` with a stale `.e2e/env` detected the dead token and minted a new one.
- `run.sh` with a failing step (seed.ts absent) exited 1 and tore the stack down. With `E2E_REUSE=1` it left the stack running.
- After `e2e:down`, `docker compose -p btk-e2e ps -a` is empty and no `btk-e2e` volumes remain.
- The dev `docker-compose.yml` passes `docker compose config -q` with dummy exported values, and fails with a clear `${VAR:?}` message when they are missing.

## Not verified here

- V18 (strip-ansi and OSC-8) is not a Firefly question and belongs to another track.
- Data-importer 2.3.5 was pinned but not started.

### V20: bill on a transfer

Checked 2026-09-25 against the same pinned stack.

```
POST /v1/bills {"name":"Probe Car","amount_min":"250","amount_max":"250","date":"2025-01-05","repeat_freq":"monthly"} -> id 1
POST transfer {CHK->SAV, 250, bill_id: 1}      -> 200, bill_id null, subscription_id null
GET  /v1/transactions/1                        -> bill_id null
PUT  {transaction_journal_id: 1, bill_id: 1}   -> 200, bill_id null
PUT  {transaction_journal_id: 1, subscription_id: 1} -> 200, null
POST withdrawal {CHK->"Car Lender", bill_id: 1} -> 200, bill_id 1, subscription_id 1 (control)
```

A transfer can therefore carry neither a budget (V8) nor a bill. That is why
R-XFER-3 classifies every transfer out of the envelope as unbudgeted.

### V21: bill schedule and payment-aware pay_dates

Checked 2026-09-25 against the same pinned stack.

```
Weekly (date 2024-12-02, $50), January 2025:
  nothing paid     pay_dates 01-06 01-13 01-20 01-27
  6th, 13th paid   pay_dates 01-20 01-27        paid 01-06 01-13
  all four paid    pay_dates 02-03              paid all four
Monthly (date 2024-12-25, $100), December's paid late on 2025-01-02:
  pay_dates 01-25   paid 01-02
Monthly (date 2025-01-31): Feb 02-28, Mar 03-31, Apr 04-30, every month-end in 2025
Quarterly skip 1 (date 2025-01-15): Jul 07-15; April query returns 07-15 (outside the window)
Half-year (date 2025-02-28): Aug 08-28, Feb 2026 02-28
Weekly skip 1 (date 2025-01-01): 01-01 01-15 01-29
```

So `pay_dates` says what is still owed, not what fell due.
`BillComparisonService` takes the month's due dates from the schedule
(`dueDatesInMonth`) and only the upcoming amount from `pay_dates`.

### V22: updating one split of a multi-split group

Checked 2026-09-25 against the same pinned stack (and independently by the
categorize review, which saw the unlisted split deleted).

```
POST group "Costco": journals 6 (food, tags [imp]) and 7 (household, category Home, tags [x])
PUT  {transactions: [{journal 7, category_name Groceries}, {journal 6}]}
  -> 422 group_title: "A group title is mandatory when there is more than one transaction."
PUT  {group_title: "Costco", transactions: [{journal 7, category_name Groceries}, {journal 6}]}
  -> 200; journal 7 category Groceries, tags [x]; journal 6 unchanged, tags [imp]
```

`TransactionService.updateTransaction` therefore lists every split of the
group and sends its title back.

### V23: unknown tag

Checked 2026-11-06 against the same pinned stack (6.6.6).

```
GET /api/v1/tags/no-such-tag-btk-probe            -> 404 {"message":"Resource not found","exception":"NotFoundHttpException"}
GET /api/v1/tags/99999                            -> 404 (same body)
GET /api/v1/tags/Disposable%20Income              -> 200
GET /api/v1/tags/no-such-tag-btk-probe, bad token -> 401
Through the SDK, TransactionService.tagExists:  existing -> true, unknown -> false, bad token -> throws ApiError 401
```

`tagExists` therefore treats only a 404 as "no such tag"; any other failure
propagates instead of being reported as a missing tag.
