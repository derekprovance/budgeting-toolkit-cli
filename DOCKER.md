# Docker

There are two Firefly III stacks, and they share nothing:

| Stack | Compose file             | Purpose                                            | Data                        |
| ----- | ------------------------ | -------------------------------------------------- | --------------------------- |
| Dev   | `docker-compose.yml`     | A local Firefly to click around in and run the CLI | Named volume, persists      |
| E2E   | `docker-compose.e2e.yml` | Driven by `npm run test:e2e`; never used by hand   | tmpfs, gone on every `down` |

Both run the same pinned images (verified in `test-harness/VERIFICATION.md`):

- `fireflyiii/core:version-6.6.6@sha256:ae69fdd9…`
- `postgres:18.6-alpine@sha256:77f58511…`
- `fireflyiii/data-importer:version-2.3.5@sha256:26276443…` (dev only, optional)

Bump a version by changing tag **and** digest together, then rerun the e2e
suite: the harness's recorded Firefly behavior (`firefly-contract.ts`) is only
verified against the pinned version.

Everything binds to **127.0.0.1** only. Postgres publishes no port at all.

## Dev stack

### 1. Container settings: `.env.docker`

```bash
cp .env.docker.example .env.docker
# Fill in POSTGRES_PASSWORD (openssl rand -hex 24)
# and FIREFLY_APP_KEY, exactly 32 chars (openssl rand -hex 16)
```

`.env.docker` is gitignored and holds **only** container settings:
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `FIREFLY_APP_KEY`. Every
value is required; compose refuses to start with a clear `${VAR:?}` message if
one is missing. There is no default password and no fallback APP_KEY.

CLI secrets (`FIREFLY_API_TOKEN`, `ANTHROPIC_API_KEY`) never go in this file and
never reach a container.

### 2. Start

```bash
docker compose --env-file .env.docker up -d --wait
```

`--env-file` is required: the `${VAR:?}` checks are resolved at interpolation
time, and the `env_file:` entry alone does not feed interpolation. `--wait`
returns once Postgres (`pg_isready`) and Firefly (`/health`) are healthy, which
takes seconds on a warm machine. The first boot runs Firefly's migrations and
takes longer.

Firefly is at http://localhost:8080.

To also start the Data Importer (http://localhost:8081):

```bash
docker compose --env-file .env.docker --profile importer up -d --wait
```

Configure the importer's Firefly URL (`http://firefly:8080`) and a token in its
own UI; no CLI secret is passed to it.

### 3. First user and API token

The dev stack has no automated bootstrap. `scripts/e2e/up.sh` is hard-wired to
the `btk-e2e` project and its `e2e@btk.invalid` user, so it cannot be pointed at
the dev stack. Create both by hand once per volume:

1. Open http://localhost:8080 and register (the first user becomes the owner).
2. **Options → Profile → OAuth → Personal Access Tokens → Create New Token.**
3. Put the CLI settings in `.env.dev` (gitignored):

```bash
FIREFLY_API_URL=http://localhost:8080   # no /api suffix, no trailing slash
FIREFLY_API_TOKEN=<token>
ANTHROPIC_API_KEY=<key>                  # only for categorize
```

### 4. Run the CLI against it

```bash
npm run start:dev -- report -m 1       # ENV_FILE=.env.dev
npm run start:dev -- analyze -m 1 --json
```

The envelope is derived from Firefly's accounts, so a dev `config.yaml` names
only what is outside it (see RULES.md):

```yaml
expectedMonthlyPaycheck: 3500

# Savings, any brokerage, the disposable pool
untrackedAccounts:
    - '2'
```

See CONFIG.md.

There is no seed script for the dev stack. Enter data by hand or through the
Data Importer. The e2e scenario is not meant to be loaded into it.

### Service management

```bash
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs -f firefly
docker compose --env-file .env.docker restart firefly
docker compose --env-file .env.docker stop           # keep containers and data
docker compose --env-file .env.docker down           # remove containers, keep data
docker compose --env-file .env.docker down -v        # remove data too
```

### Database access

```bash
docker compose --env-file .env.docker exec db psql -U firefly -d firefly

# Backup / restore
docker compose --env-file .env.docker exec db pg_dump -U firefly firefly > backup.sql
docker compose --env-file .env.docker exec -T db psql -U firefly firefly < backup.sql
```

`*.sql` and `*.dump` are gitignored. The pg18 image keeps its data under
`/var/lib/postgresql/18/docker`, so the volume is mounted at
`/var/lib/postgresql`, not `…/data`.

## E2E stack

`npm run test:e2e` owns this stack end to end. You need Docker, `curl` and
`openssl`; nothing else, and no manual token steps.

```bash
npm run test:e2e          # up → seed → jest → down
npm run test:e2e:reuse    # same, but leave the stack up and reuse its data
```

Extra arguments go to Jest (`npm run test:e2e -- -t split`).

### Lifecycle

`scripts/e2e/run.sh` runs these steps and installs a `trap` that runs
`npm run e2e:down` on exit, success or failure, unless `E2E_REUSE=1`.

1. **`npm run e2e:up`** (`scripts/e2e/up.sh`)
    - Generates `.e2e/app-key` (32 chars), mounted into Firefly as a compose
      secret via `APP_KEY_FILE`.
    - `docker compose -f docker-compose.e2e.yml up -d --wait` (project
      `btk-e2e`). Postgres runs on **tmpfs**, so every fresh `up` starts from an
      empty database. Firefly runs with `TZ=UTC` and `restart: "no"`.
    - Resolves Firefly's **ephemeral** host port and refuses to continue unless
      it is bound to `127.0.0.1`.
    - Bootstraps inside the container: runs `system:create-first-user` for
      `e2e@btk.invalid`, creates a Passport personal access client if none
      exists, and mints a token. It refuses if the database already holds a
      different user.
    - Writes `.e2e/env` (`FIREFLY_API_URL`, `FIREFLY_API_TOKEN`, mode 600) and
      `.e2e/state.json` (port, URL), then smoke-tests `/api/v1/about/user`.
    - Idempotent: rerun against a running stack, it reuses the user and the
      token in `.e2e/env` if that token still authenticates.
2. **`npm run e2e:seed`** (`scripts/e2e/seed.ts` → `test-harness/seed/seed-scenario.ts`)
   loads the scenario from `test-harness/scenario/ledger.ts`: sets USD as the
   primary currency (a fresh install is EUR), creates accounts, budgets and
   limits, bills and transactions, deactivates what the scenario deactivates,
   reads everything back to prove it persisted, and writes `.e2e/id-map.json`
   and `.e2e/config.yaml`. It creates the marker tag `btk-e2e-seed-<hash>` last.
3. **Jest** with `e2e/jest.config.mjs`, in band (60s timeout, one worker). The
   CLI is spawned as `tsx src/index.ts --config .e2e/config.yaml`.
4. **`npm run e2e:down`** removes the containers, volumes and data. Afterwards
   `docker compose -p btk-e2e ps -a` is empty.

### `.e2e/` artifacts

All gitignored, directory mode 700:

| File          | Written by | Contents                                |
| ------------- | ---------- | --------------------------------------- |
| `app-key`     | `e2e:up`   | Firefly APP_KEY                         |
| `env`         | `e2e:up`   | CLI URL and token, mode 600             |
| `state.json`  | `e2e:up`   | Ephemeral port and URL                  |
| `id-map.json` | `e2e:seed` | Scenario key → Firefly id               |
| `config.yaml` | `e2e:seed` | Scenario config with real ids filled in |

### Reuse mode and the seed marker

With `E2E_REUSE=1` the stack stays up after the run, which makes iterating on
e2e tests fast. The seeder then decides from the marker tag:

- Marker `btk-e2e-seed-<hash>` present and the hash matches the current
  scenario (`scenarioHash()` over `ledger.ts` + `config.ts`): skip seeding.
- Data present but no marker, or a marker with a different hash: **abort**.
  The data cannot be trusted to match the expected values. Run
  `npm run e2e:down` and start again.

The `split` test creates and deletes its own April transaction, so it leaves
the seeded months untouched.

### Safety guard

The e2e suite must never reach the real Firefly or Anthropic:

- `.e2e/env` is loaded explicitly; the seeder and global setup call
  `assertLocalFirefly` (`test-harness/safety.ts`), which rejects any URL not on
  `127.0.0.1`/`localhost`, and check the token belongs to `e2e@btk.invalid`.
- The CLI runs with an environment built from scratch (`PATH`, temp `HOME`,
  `ENV_FILE=.e2e/env`, `BTK_STRICT_CONFIG=1`, `BTK_PAGE_SIZE=10`,
  `LOG_LEVEL=silent`, `TZ=UTC`) in a temp `cwd`. No `FIREFLY_*` or `ANTHROPIC_*`
  variable is inherited, and `ANTHROPIC_*` is rejected outright.
- `BTK_STRICT_CONFIG=1` disables the `./.env`, `~/.budget/.env`,
  `./config.yaml` and `~/.budget/config.yaml` fallbacks, so a missing artifact
  is an error rather than a silent switch to your real credentials.

## Troubleshooting

**`required variable … is missing a value`** — the dev stack was started
without `--env-file .env.docker`, or a value in it is empty.

**Firefly unhealthy / `--wait` times out** — `docker compose … logs firefly`.
Usual causes: APP_KEY not exactly 32 characters, or port 8080 already in use on
127.0.0.1 (dev stack only; the e2e stack picks a free port).

**401 from the CLI (dev)** — check the token in `.env.dev` and that
`FIREFLY_API_URL` is `http://localhost:8080` with no `/api` suffix or trailing
slash. A token dies with its volume, so recreate it after `down -v`.

**`e2e:up` says the bootstrap failed** — rerun the bootstrap step (`exec -T firefly php`) from `up.sh` without `2>/dev/null` to see Firefly's error.
`refusing: database already has users` means a stale stack: `npm run e2e:down`.

**Seeder aborts on the marker** — the running e2e database was seeded from a
different scenario, or by hand. `npm run e2e:down`, then rerun.

**E2E stack left running** — only `test:e2e:reuse` or a killed `run.sh` does
this. `npm run e2e:down` removes it and its data.

**Storage permission errors (dev)** —
`docker compose --env-file .env.docker exec firefly chown -R www-data:www-data /var/www/html/storage`.

## Resources

- [Firefly III documentation](https://docs.firefly-iii.org/)
- [Firefly III API](https://api-docs.firefly-iii.org/)
