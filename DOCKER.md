# Docker Development Environment

This guide explains how to set up and use the Docker development environment for testing the Budgeting Toolkit CLI with Firefly III.

## Overview

The Docker setup includes:

- **Firefly III** - Personal finance manager (port 8080)
- **PostgreSQL** - Database backend (port 5432)
- **Data Importer** - Bulk import tool (port 8081)
- **Adminer** - Database management UI (port 8082)

## Quick Start

### 1. Start the Environment

```bash
# Start all services
docker-compose up -d

# Check service status
./docker/docker-dev.sh status
```

### 2. Initial Setup

Wait for Firefly III to initialize (about 1-2 minutes). Services should show as "healthy".

### 3. Access Firefly III

1. Open http://localhost:8080 in your browser
2. Register a new account (first user becomes admin)
    - Email: `admin@example.com` (or any email)
    - Password: Choose a secure password
3. Complete the setup wizard

### 4. Generate API Token

```bash
# Get instructions for token generation
./docker/docker-dev.sh token
```

Follow the instructions to:

1. Access Firefly III → **Options** → **Profile** → **OAuth**
2. Create a **Personal Access Token** named `Budgeting Toolkit CLI`
3. Copy the generated token

### 5. Set Environment Variables

**Following 12-factor app principles**, this project uses environment variables for configuration:

```bash
# Set environment variables for Docker development
export FIREFLY_API_URL=http://localhost:8080/api/v1
export FIREFLY_API_TOKEN=<paste_your_token_here>

# Verify configuration
./docker/docker-dev.sh env
```

**Important:** Do NOT modify your production `.env` file for Docker development. Environment variables keep development and production configurations separate.

**Optional:** For convenience, you can create a local helper script (gitignored):

```bash
# Create a personal wrapper (not committed to git)
cat > budget-dev.sh << 'EOF'
#!/bin/bash
export FIREFLY_API_URL=http://localhost:8080/api/v1
export FIREFLY_API_TOKEN=<your-token>
./budget.sh "$@"
EOF
chmod +x budget-dev.sh

# Use it
./budget-dev.sh finalize-budget -m 1
```

### 6. Seed Test Data

```bash
# Seed the database (requires FIREFLY_API_TOKEN to be set)
./docker/docker-dev.sh seed
```

This creates:

- 2 asset accounts (Checking, Savings)
- 2 revenue accounts (Salary, Freelance)
- 4 expense accounts
- 5 categories
- 2 budgets
- 2 tags
- 6 sample transactions

### 7. Test Your CLI

```bash
# Compile TypeScript
npm run compile

# Test connection
./docker/docker-dev.sh test

# Run commands (with environment variables set)
./budget.sh budget-report -m 1
./budget.sh finalize-budget -m 1

# Or use your helper script if created
./budget-dev.sh budget-report -m 1
```

## Docker Commands Reference

### Service Management

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose stop

# Stop and remove containers (keeps data)
docker-compose down

# Stop and remove everything including data
docker-compose down -v

# Restart a specific service
docker-compose restart firefly

# View logs
docker-compose logs -f firefly
docker-compose logs -f db
```

### Database Access

#### Via Adminer (Web UI)

1. Open http://localhost:8082
2. Login with:
    - System: `PostgreSQL`
    - Server: `db`
    - Username: `firefly`
    - Password: `firefly_secret`
    - Database: `firefly`

#### Via psql CLI

```bash
docker-compose exec db psql -U firefly -d firefly

# Example queries
\dt                           # List tables
SELECT * FROM users;          # View users
SELECT * FROM transactions;   # View transactions
```

### Backup and Restore

#### Backup Database

```bash
docker-compose exec db pg_dump -U firefly firefly > backup.sql
```

#### Restore Database

```bash
docker-compose exec -T db psql -U firefly firefly < backup.sql
```

#### Export Firefly Data

```bash
# In Firefly UI: Options → Export data
# Or use the API
curl -H "Authorization: Bearer $FIREFLY_API_TOKEN" \
  http://localhost:8080/api/v1/data/export
```

## Configuration

### Environment Variables

Key variables in `docker-compose.yml`:

- `DB_CONNECTION=pgsql` - Use PostgreSQL (can switch to `mysql`)
- `APP_KEY` - Must be exactly 32 characters
- `APP_DEBUG=true` - Enable debug mode for development
- `DKR_RUN_MIGRATION=true` - Auto-run database migrations
- `TRUSTED_PROXIES=**` - Allow all proxies (dev only)

### Ports

Default ports (change in `docker-compose.yml` if needed):

- Firefly III: `8080`
- Data Importer: `8081`
- Adminer: `8082`
- PostgreSQL: `5432`

## Data Seeding

### Using the Helper Script (Recommended)

```bash
# Set your API token first
export FIREFLY_API_TOKEN="your_token"

# Run seeding through the helper
./docker/docker-dev.sh seed
```

### Using the Provided Script Directly

The `seed-firefly.sh` script creates a complete test environment:

```bash
# Basic usage (uses FIREFLY_API_TOKEN from environment)
export FIREFLY_API_TOKEN="your_token"
./docker/seed-data/seed-firefly.sh

# With custom URL
export FIREFLY_URL="http://localhost:8080"
export FIREFLY_API_TOKEN="your_token"
./docker/seed-data/seed-firefly.sh
```

### Manual Seeding via API

```bash
# Example: Create an account
curl -X POST http://localhost:8080/api/v1/accounts \
  -H "Authorization: Bearer $FIREFLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "asset",
    "name": "Test Account",
    "currency_code": "USD",
    "current_balance": "1000"
  }'
```

### Using the Data Importer

1. Access http://localhost:8081
2. Configure connection to Firefly III
3. Upload CSV files with transactions
4. Map columns and import

## Switching to MySQL

To use MySQL instead of PostgreSQL:

1. Edit `docker-compose.yml`:

```yaml
db:
    image: mysql:8
    environment:
        - MYSQL_ROOT_PASSWORD=root_secret
        - MYSQL_DATABASE=firefly
        - MYSQL_USER=firefly
        - MYSQL_PASSWORD=firefly_secret

firefly:
    environment:
        - DB_CONNECTION=mysql
        - DB_HOST=db
        - DB_PORT=3306
        - DB_DATABASE=firefly
        - DB_USERNAME=firefly
        - DB_PASSWORD=firefly_secret
```

2. Restart services:

```bash
docker-compose down -v
docker-compose up -d
```

## Troubleshooting

### Firefly won't start

```bash
# Check logs
docker-compose logs firefly

# Common issues:
# 1. APP_KEY must be exactly 32 characters
# 2. Database not ready - wait longer
# 3. Port 8080 already in use
```

### Database connection errors

```bash
# Ensure DB is healthy
docker-compose ps db

# Check DB logs
docker-compose logs db

# Test connection
docker-compose exec db psql -U firefly -d firefly -c "SELECT 1;"
```

### Permission errors

```bash
# Fix volume permissions
docker-compose exec firefly chown -R www-data:www-data /var/www/html/storage
```

### Reset everything

```bash
# Nuclear option - removes all data
docker-compose down -v
docker volume prune -f
docker-compose up -d
```

### API returns 401 Unauthorized

1. Verify token is correct
2. Regenerate token in Firefly UI
3. Check token hasn't expired
4. Ensure URL format: `http://localhost:8080/api/v1` (no trailing slash)

## Development Workflow

### Typical Development Session (12-Factor Approach)

```bash
# 1. Start Docker environment
docker-compose up -d
./docker/docker-dev.sh status

# 2. Set environment variables (once per terminal session)
export FIREFLY_API_URL=http://localhost:8080/api/v1
export FIREFLY_API_TOKEN="your_token"

# 3. Verify configuration
./docker/docker-dev.sh env

# 4. Seed data (first time only)
./docker/docker-dev.sh seed

# 5. Test connection
./docker/docker-dev.sh test

# 6. Compile and test
npm run compile
./budget.sh budget-report -m 1

# 7. Make code changes and test
npm run compile && ./budget.sh finalize-budget -m 1

# 8. Run tests
npm test

# 9. When done
docker-compose stop
```

### Using a Helper Script (Optional)

For convenience, create a local wrapper:

```bash
# Create once (gitignored)
cat > budget-dev.sh << 'EOF'
#!/bin/bash
export FIREFLY_API_URL=http://localhost:8080/api/v1
export FIREFLY_API_TOKEN=your_actual_token_here
./budget.sh "$@"
EOF
chmod +x budget-dev.sh

# Then use it for all commands
./budget-dev.sh budget-report -m 1
./budget-dev.sh finalize-budget -m 1
```

This keeps your production `.env` file untouched.

### Testing Different Scenarios

```bash
# Create test transactions for different months
./docker/seed-data/seed-firefly.sh

# Or manually via CLI
./budget.sh update-transactions "test-import" -y

# View results
./budget.sh budget-report -m $(date +%m)
./budget.sh finalize-budget -m $(date +%m)
```

## Integration with CLI

### Update Configuration Files

Your `budgeting-toolkit.config.yaml` should match the seeded data:

```yaml
expectedMonthlyPaycheck: 3500
validDestinationAccounts:
    - 'Main Checking Account'
    - 'Savings Account'
validExpenseAccounts:
    - 'Grocery Store'
    - 'Utility Company'
    - 'Landlord'
    - 'ISP Provider'
    - 'Gas Station'
    - 'Local Coffee Shop'
excludedAdditionalIncomePatterns:
    - 'PAYROLL'
```

### Testing AI Features

```bash
# Make sure ANTHROPIC_API_KEY is set
export ANTHROPIC_API_KEY="your_claude_api_key"

# Test transaction updates
./budget.sh update-transactions "test-batch" -y
```

## Additional Resources

- [Firefly III Documentation](https://docs.firefly-iii.org/)
- [Firefly III API Documentation](https://api-docs.firefly-iii.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

## Clean Up

```bash
# Stop containers but keep data
docker-compose stop

# Remove containers but keep data
docker-compose down

# Remove everything including volumes
docker-compose down -v

# Remove Docker images
docker-compose down --rmi all -v
```
