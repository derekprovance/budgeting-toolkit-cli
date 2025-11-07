#!/bin/bash
set -e

# Firefly III Data Seeding Script
# This script uses the Firefly III API to seed test data

echo "=== Firefly III Data Seeder ==="

# Configuration
FIREFLY_URL="${FIREFLY_URL:-http://localhost:8080}"
API_TOKEN="${FIREFLY_API_TOKEN}"

if [ -z "$API_TOKEN" ]; then
    echo "Error: FIREFLY_API_TOKEN environment variable is required"
    echo "Generate a token in Firefly III: Options -> Profile -> OAuth -> Personal Access Tokens"
    exit 1
fi

# Helper function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3

    curl -s -X "$method" \
        -H "Authorization: Bearer $API_TOKEN" \
        -H "Content-Type: application/json" \
        -H "Accept: application/json" \
        -d "$data" \
        "$FIREFLY_URL/api/v1/$endpoint"
}

echo "Testing API connection..."
response=$(curl -s -H "Authorization: Bearer $API_TOKEN" "$FIREFLY_URL/api/v1/about")
if echo "$response" | grep -q "version"; then
    echo "✓ Connected to Firefly III"
else
    echo "✗ Failed to connect to Firefly III"
    echo "Response: $response"
    exit 1
fi

echo ""
echo "Creating accounts..."

# Create Asset Accounts (Checking/Savings)
CHECKING_ACCOUNT=$(api_call POST "accounts" '{
    "type": "asset",
    "name": "Main Checking Account",
    "account_role": "defaultAsset",
    "currency_code": "USD",
    "current_balance": "5000",
    "include_net_worth": true
}')
echo "✓ Created Main Checking Account"

SAVINGS_ACCOUNT=$(api_call POST "accounts" '{
    "type": "asset",
    "name": "Savings Account",
    "account_role": "savingAsset",
    "currency_code": "USD",
    "current_balance": "10000",
    "include_net_worth": true
}')
echo "✓ Created Savings Account"

# Create Revenue Accounts (Income sources)
SALARY_ACCOUNT=$(api_call POST "accounts" '{
    "type": "revenue",
    "name": "Salary Income",
    "account_role": "null",
    "currency_code": "USD"
}')
echo "✓ Created Salary Income Account"

FREELANCE_ACCOUNT=$(api_call POST "accounts" '{
    "type": "revenue",
    "name": "Freelance Income",
    "account_role": "null",
    "currency_code": "USD"
}')
echo "✓ Created Freelance Income Account"

# Create Expense Accounts
GROCERY_EXPENSE=$(api_call POST "accounts" '{
    "type": "expense",
    "name": "Grocery Store",
    "account_role": "null",
    "currency_code": "USD"
}')
echo "✓ Created Grocery Store Expense Account"

UTILITY_EXPENSE=$(api_call POST "accounts" '{
    "type": "expense",
    "name": "Utility Company",
    "account_role": "null",
    "currency_code": "USD"
}')
echo "✓ Created Utility Company Expense Account"

RENT_EXPENSE=$(api_call POST "accounts" '{
    "type": "expense",
    "name": "Landlord",
    "account_role": "null",
    "currency_code": "USD"
}')
echo "✓ Created Landlord Expense Account"

echo ""
echo "Creating categories..."

# Create Categories
GROCERIES_CAT=$(api_call POST "categories" '{
    "name": "Groceries"
}')
echo "✓ Created Groceries Category"

BILLS_CAT=$(api_call POST "categories" '{
    "name": "Bills"
}')
echo "✓ Created Bills Category"

PAYCHECK_CAT=$(api_call POST "categories" '{
    "name": "Paycheck"
}')
echo "✓ Created Paycheck Category"

RENT_CAT=$(api_call POST "categories" '{
    "name": "Housing"
}')
echo "✓ Created Housing Category"

echo ""
echo "Creating budgets..."

# Create Budget for current month
CURRENT_DATE=$(date +%Y-%m-01)
NEXT_MONTH=$(date -v+1m +%Y-%m-01 2>/dev/null || date -d "+1 month" +%Y-%m-01)

GROCERY_BUDGET=$(api_call POST "budgets" '{
    "name": "Grocery Budget",
    "active": true,
    "auto_budget_type": "none"
}')
echo "✓ Created Grocery Budget"

BILLS_BUDGET=$(api_call POST "budgets" '{
    "name": "Bills Budget",
    "active": true,
    "auto_budget_type": "none"
}')
echo "✓ Created Bills Budget"

echo ""
echo "Creating tags..."

# Create Tags
BILLS_TAG=$(api_call POST "tags" '{
    "tag": "Bills"
}')
echo "✓ Created Bills Tag"

DISPOSABLE_TAG=$(api_call POST "tags" '{
    "tag": "Disposable Income"
}')
echo "✓ Created Disposable Income Tag"

echo ""
echo "Creating sample transactions..."

# Sample Paycheck Deposit
api_call POST "transactions" "{
    \"error_if_duplicate_hash\": false,
    \"apply_rules\": true,
    \"transactions\": [{
        \"type\": \"deposit\",
        \"date\": \"$(date -v-15d +%Y-%m-%d 2>/dev/null || date -d '15 days ago' +%Y-%m-%d)\",
        \"amount\": \"3500\",
        \"description\": \"PAYROLL - Monthly Salary\",
        \"source_name\": \"Salary Income\",
        \"destination_name\": \"Main Checking Account\",
        \"category_name\": \"Paycheck\",
        \"currency_code\": \"USD\"
    }]
}"
echo "✓ Created Paycheck Transaction"

# Sample Grocery Expense
api_call POST "transactions" "{
    \"error_if_duplicate_hash\": false,
    \"apply_rules\": true,
    \"transactions\": [{
        \"type\": \"withdrawal\",
        \"date\": \"$(date -v-10d +%Y-%m-%d 2>/dev/null || date -d '10 days ago' +%Y-%m-%d)\",
        \"amount\": \"125.50\",
        \"description\": \"Whole Foods Market\",
        \"source_name\": \"Main Checking Account\",
        \"destination_name\": \"Grocery Store\",
        \"category_name\": \"Groceries\",
        \"budget_name\": \"Grocery Budget\",
        \"currency_code\": \"USD\"
    }]
}"
echo "✓ Created Grocery Transaction"

# Sample Utility Bill
api_call POST "transactions" "{
    \"error_if_duplicate_hash\": false,
    \"apply_rules\": true,
    \"transactions\": [{
        \"type\": \"withdrawal\",
        \"date\": \"$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d '7 days ago' +%Y-%m-%d)\",
        \"amount\": \"85.00\",
        \"description\": \"Electric Bill Payment\",
        \"source_name\": \"Main Checking Account\",
        \"destination_name\": \"Utility Company\",
        \"category_name\": \"Bills\",
        \"budget_name\": \"Bills Budget\",
        \"tags\": [\"Bills\"],
        \"currency_code\": \"USD\"
    }]
}"
echo "✓ Created Utility Bill Transaction"

# Sample Rent Payment
api_call POST "transactions" "{
    \"error_if_duplicate_hash\": false,
    \"apply_rules\": true,
    \"transactions\": [{
        \"type\": \"withdrawal\",
        \"date\": \"$(date -v-5d +%Y-%m-%d 2>/dev/null || date -d '5 days ago' +%Y-%m-%d)\",
        \"amount\": \"1200.00\",
        \"description\": \"Monthly Rent\",
        \"source_name\": \"Main Checking Account\",
        \"destination_name\": \"Landlord\",
        \"category_name\": \"Housing\",
        \"tags\": [\"Bills\"],
        \"currency_code\": \"USD\"
    }]
}"
echo "✓ Created Rent Payment Transaction"

# Sample Freelance Income
api_call POST "transactions" "{
    \"error_if_duplicate_hash\": false,
    \"apply_rules\": true,
    \"transactions\": [{
        \"type\": \"deposit\",
        \"date\": \"$(date -v-3d +%Y-%m-%d 2>/dev/null || date -d '3 days ago' +%Y-%m-%d)\",
        \"amount\": \"500.00\",
        \"description\": \"Freelance Project Payment\",
        \"source_name\": \"Freelance Income\",
        \"destination_name\": \"Main Checking Account\",
        \"currency_code\": \"USD\"
    }]
}"
echo "✓ Created Freelance Income Transaction"

# Sample Transfer to Savings
api_call POST "transactions" "{
    \"error_if_duplicate_hash\": false,
    \"apply_rules\": true,
    \"transactions\": [{
        \"type\": \"transfer\",
        \"date\": \"$(date -v-2d +%Y-%m-%d 2>/dev/null || date -d '2 days ago' +%Y-%m-%d)\",
        \"amount\": \"500.00\",
        \"description\": \"Monthly Savings Transfer\",
        \"source_name\": \"Main Checking Account\",
        \"destination_name\": \"Savings Account\",
        \"currency_code\": \"USD\"
    }]
}"
echo "✓ Created Savings Transfer Transaction"

echo ""
echo "=== Seeding Complete! ==="
echo ""
echo "Summary:"
echo "- 3 Asset/Revenue/Expense Accounts created"
echo "- 4 Categories created"
echo "- 2 Budgets created"
echo "- 2 Tags created"
echo "- 6 Sample transactions created"
echo ""
echo "You can now use the Firefly III API with your budgeting toolkit!"
echo "Firefly III URL: $FIREFLY_URL"
