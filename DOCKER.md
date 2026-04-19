# Docker Development Environment

Docker setup for testing the Budgeting Toolkit CLI with Firefly III locally.

## Overview

Services included:

- **Firefly III** - Personal finance manager (port 8080)
- **PostgreSQL** - Database backend (port 5432)
- **Data Importer** - CSV import tool (port 8081)

## Quick Start

### 1. Configure Environment

```bash
# Copy template
cp .env.example .env.dev

# Edit .env.dev and set:
# - FIREFLY_API_TOKEN (generate after setup)
# - ANTHROPIC_API_KEY (if using AI features)
```

The `.env.dev` file is gitignored and safe for local secrets.

### 2. Start Services

```bash
# Start all services
docker compose up -d

# Check status
docker compose ps
```

### 3. Setup Firefly III

Wait 1-2 minutes for initialization, then:

1. Open http://localhost:8080
2. Register new account (first user becomes admin)
3. Complete setup wizard

**Default test credentials (Docker environment only):**

- Email: `test@test.com`
- Password: `thisisatestpassword`

### 4. Generate API Token

1. In Firefly: **Options** → **Profile** → **OAuth**
2. Under **Personal Access Tokens**, click **Create New Token**
3. Name: `Budgeting Toolkit CLI`
4. Copy token and add to `.env.dev`:

```bash
FIREFLY_API_TOKEN=<your_token_here>
```

### 5. Verify Connection

```bash
# Test CLI connection
npm run start:dev -- report -m 1
```

## E2E Testing

### Seed Test Data

Before running E2E tests, seed the Docker environment with realistic end-of-month test data:

```bash
npm run seed:docker
```

This creates accounts, budgets, bills, and a full month of transactions that simulate a real end-of-month finalization:

| Data                | Detail                                                                       |
| ------------------- | ---------------------------------------------------------------------------- |
| Asset account       | Test Checking                                                                |
| Revenue accounts    | Test Employer, Test Side Income                                              |
| Expense accounts    | Test Groceries Store, Test Dining, Test Netflix, Test Gas Station, Test Misc |
| Budgets             | Groceries ($500), Dining ($200), Entertainment ($100)                        |
| Bills               | Rent ($1,500/mo), Netflix ($15.99/mo)                                        |
| Paycheck deposit    | $4,000 on the 1st (tagged `Paycheck`)                                        |
| Bill payments       | Rent + Netflix paid                                                          |
| Budgeted expenses   | Groceries $355 · Dining $130                                                 |
| Unbudgeted expenses | Gas $55 · misc $30                                                           |
| Additional income   | Freelance $350 mid-month                                                     |
| Uncategorized       | 1 transaction tagged `e2e-test` (for categorize dry-run)                     |

The script also writes `scripts/e2e-config.yaml` with the real account IDs from the newly created accounts.

> **Re-run after `docker compose down -v`**: The seed script must be run again any time the Docker volumes are wiped, since account IDs change with each fresh database.

### Run E2E Tests

```bash
npm run test:e2e:docker
```

This runs three CLI commands against the live Firefly III instance:

1. `analyze` — validates full cash flow analysis (paycheck, bills, budget, unbudgeted, additional income)
2. `report` — validates budget report rendering with spending visualizations
3. `categorize --dry-run` — validates AI categorization pipeline against the `e2e-test` tagged transaction without mutating data

To run E2E tests against your local `.env`:

```bash
npm run test:e2e
```

### Full E2E Workflow (first time)

```bash
docker compose up -d            # Start services
# Complete Firefly setup at http://localhost:8080
# Generate API token → add to .env.dev
npm run seed:docker             # Create test data + write e2e-config.yaml
npm run test:e2e:docker         # Run E2E tests
```

### 6. Import Custom Test Data

For custom data beyond the seed script, use the Data Importer at http://localhost:8081:

1. Configure connection:
    - Firefly URL: `http://firefly:8080`
    - Token: Your API token
2. Upload CSV files
3. Map columns and import

## Development Workflows

### npm run Scripts (Recommended)

Best for active development with TypeScript:

```bash
# Run without compilation
npm run start:dev -- report -m 1
npm run start:dev -- analyze -m 1
npm run start:dev -- categorize Import-2024
```

### Production Mode

Compile and run:

```bash
npm run compile
./budget.sh report -m 1
```

### Environment Separation

- **Production**: `npm start` or `./budget.sh` (uses `.env`)
- **Docker**: `npm start:dev` (uses `.env.dev`)

## Docker Commands

### Service Management

```bash
# Start/stop
docker compose up -d
docker compose stop
docker compose restart firefly

# Remove containers (keeps data)
docker compose down

# Remove everything including data
docker compose down -v

# View logs
docker compose logs -f firefly
docker compose logs -f db
```

### Database Access

#### Via psql CLI

```bash
docker compose exec db psql -U firefly -d firefly

# Example queries
\dt                          # List tables
SELECT * FROM users;         # View users
SELECT * FROM transactions;  # View transactions
```

### Backup and Restore

```bash
# Backup
docker compose exec db pg_dump -U firefly firefly > backup.sql

# Restore
docker compose exec -T db psql -U firefly firefly < backup.sql
```

## Configuration

### Environment Variables (.env.dev)

**Required:**

- `FIREFLY_APP_KEY` - Exactly 32 characters for encryption
- `FIREFLY_API_URL` - Set to `http://localhost:8080`
- `FIREFLY_API_TOKEN` - Generate from Firefly UI

**Optional:**

- `ANTHROPIC_API_KEY` - For AI categorization
- `LOG_LEVEL` - Set to `debug` for verbose logging
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` - Database credentials

**Not Required:**

- `CLIENT_CERT_*` - Skip for local Docker (no mTLS needed)

### Ports

Configurable in `.env.dev`:

- Firefly III: `8080`
- Data Importer: `8081`
- PostgreSQL: `5432`

## Troubleshooting

### Firefly Won't Start

```bash
# Check logs
docker compose logs firefly

# Common issues:
# - APP_KEY must be 32 characters exactly
# - Database not ready - wait longer
# - Port 8080 in use
```

### Database Connection Errors

```bash
# Check DB health
docker compose ps db
docker compose logs db

# Test connection
docker compose exec db psql -U firefly -d firefly -c "SELECT 1;"
```

### API Returns 401 Unauthorized

1. Verify token in `.env.dev`
2. Regenerate token in Firefly UI
3. Check URL format: `http://localhost:8080` (no /api/v1 suffix or trailing slash)

### Permission Errors

```bash
# Fix storage permissions
docker compose exec firefly chown -R www-data:www-data /var/www/html/storage
```

### Reset Everything

```bash
# Nuclear option - removes all data
docker compose down -v
docker volume prune -f
docker compose up -d
```

## Advanced Configuration

### Switch to MySQL

Edit `docker-compose.yml`:

```yaml
db:
    image: mysql:8
    environment:
        MYSQL_ROOT_PASSWORD: root_secret
        MYSQL_DATABASE: firefly
        MYSQL_USER: firefly
        MYSQL_PASSWORD: firefly_secret

firefly:
    environment:
        DB_CONNECTION: mysql
        DB_PORT: 3306
```

Then restart:

```bash
docker compose down -v
docker compose up -d
```

### Update config.yaml

Match configuration to your test data:

```yaml
expectedMonthlyPaycheck: 3500
validDestinationAccounts:
    - '1' # Main Checking
    - '2' # Savings
validExpenseSourceAccounts:
    - '3' # Credit Card
excludedAdditionalIncomePatterns:
    - PAYROLL
```

## Typical Development Session

```bash
# 1. First time setup
cp .env.example .env.dev
# Edit .env.dev

# 2. Start environment
docker compose up -d

# 3. Setup Firefly (first time)
# - Open http://localhost:8080
# - Register admin account (test@test.com / thisisatestpassword for Docker)
# - Generate API token (Options → Profile → OAuth → Personal Access Tokens)
# - Add token to .env.dev

# 4. Seed test data (first time, or after docker compose down -v)
npm run seed:docker

# 5. Run E2E tests
npm run test:e2e:docker

# 6. Make changes and test
npm test
npm run start:dev -- analyze -m 1

# 7. Stop when done
docker compose stop
```

## Additional Resources

- [Firefly III Documentation](https://docs.firefly-iii.org/)
- [Firefly III API Docs](https://api-docs.firefly-iii.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Clean Up

```bash
# Stop containers, keep data
docker compose stop

# Remove containers, keep data
docker compose down

# Remove everything including data
docker compose down -v

# Remove images too
docker compose down --rmi all -v
```
