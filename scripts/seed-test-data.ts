/**
 * Seed script for E2E testing
 *
 * Creates realistic end-of-month test data in a local Firefly III Docker instance.
 * Also writes scripts/e2e-config.yaml with the real account IDs so E2E tests
 * can reference them without manual configuration.
 *
 * Usage:
 *   npm run seed:docker
 */

import { FireflyClientWithCerts } from '../src/api/firefly-client-with-certs.js';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load Docker environment
const envFile = process.env.ENV_FILE ?? '.env';
dotenv.config({ path: envFile });

const BASE_URL = process.env.FIREFLY_API_URL;
const TOKEN = process.env.FIREFLY_API_TOKEN;

if (!BASE_URL || !TOKEN) {
    console.error(`Missing FIREFLY_API_URL or FIREFLY_API_TOKEN in ${envFile}`);
    process.exit(1);
}

const client = new FireflyClientWithCerts({ BASE: `${BASE_URL}/api`, TOKEN });

// Spread transactions across the current month to simulate a realistic month-end state
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth();
const monthStr = String(month + 1).padStart(2, '0');
const startDate = `${year}-${monthStr}-01`;
const lastDay = new Date(year, month + 1, 0).getDate();
const endDate = `${year}-${monthStr}-${lastDay}`;

function date(day: number): string {
    return `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
}

async function seed() {
    console.log(`Seeding test data for ${year}-${monthStr} (${startDate} → ${endDate})...\n`);

    // ── Accounts ────────────────────────────────────────────────────────────────

    console.log('Creating accounts...');

    const checkingRes = await client.accounts.storeAccount({
        name: 'Test Checking',
        type: 'asset',
        account_role: 'defaultAsset',
    });
    const checkingId = checkingRes.data.id!;

    const savingsRes = await client.accounts.storeAccount({
        name: 'Test Savings',
        type: 'asset',
        account_role: 'savingAsset',
    });
    const savingsId = savingsRes.data.id!;

    console.log(`  ✓ Savings account: ${savingsId}`);

    const employerRes = await client.accounts.storeAccount({
        name: 'Test Employer',
        type: 'revenue',
    });
    const employerId = employerRes.data.id!;

    const sideIncomeRes = await client.accounts.storeAccount({
        name: 'Test Side Income',
        type: 'revenue',
    });
    const sideIncomeId = sideIncomeRes.data.id!;

    const groceriesExpRes = await client.accounts.storeAccount({
        name: 'Test Groceries Store',
        type: 'expense',
    });
    const groceriesExpId = groceriesExpRes.data.id!;

    const diningExpRes = await client.accounts.storeAccount({
        name: 'Test Dining',
        type: 'expense',
    });
    const diningExpId = diningExpRes.data.id!;

    const netflixExpRes = await client.accounts.storeAccount({
        name: 'Test Netflix',
        type: 'expense',
    });
    const netflixExpId = netflixExpRes.data.id!;

    const gasExpRes = await client.accounts.storeAccount({
        name: 'Test Gas Station',
        type: 'expense',
    });
    const gasExpId = gasExpRes.data.id!;

    const miscExpRes = await client.accounts.storeAccount({
        name: 'Test Misc',
        type: 'expense',
    });
    const miscExpId = miscExpRes.data.id!;

    console.log(`  ✓ Checking account: ${checkingId}`);
    console.log(`  ✓ Savings account: ${savingsId}`);
    console.log(
        `  ✓ Expense accounts: ${[groceriesExpId, diningExpId, netflixExpId, gasExpId, miscExpId].join(', ')}`
    );

    // ── Bills ───────────────────────────────────────────────────────────────────

    console.log('Creating bills...');

    const netflixBillRes = await client.bills.storeBill({
        name: 'Netflix',
        amount_min: '15.99',
        amount_max: '15.99',
        date: startDate,
        repeat_freq: 'monthly',
        active: true,
    });
    const netflixBillId = netflixBillRes.data.id!;

    const rentBillRes = await client.bills.storeBill({
        name: 'Rent',
        amount_min: '1500.00',
        amount_max: '1500.00',
        date: startDate,
        repeat_freq: 'monthly',
        active: true,
    });
    const rentBillId = rentBillRes.data.id!;

    console.log(`  ✓ Bills: Netflix (${netflixBillId}), Rent (${rentBillId})`);

    // ── Budgets + limits ─────────────────────────────────────────────────────────

    console.log('Creating budgets and limits...');

    const groceryBudgetRes = await client.budgets.storeBudget({ name: 'Groceries', active: true });
    const groceryBudgetId = groceryBudgetRes.data.id!;

    const diningBudgetRes = await client.budgets.storeBudget({ name: 'Dining', active: true });
    const diningBudgetId = diningBudgetRes.data.id!;

    const entertBudgetRes = await client.budgets.storeBudget({
        name: 'Entertainment',
        active: true,
    });
    const entertBudgetId = entertBudgetRes.data.id!;

    await client.budgets.storeBudgetLimit(groceryBudgetId, {
        budget_id: groceryBudgetId,
        start: startDate,
        end: endDate,
        amount: '500.00',
    });

    await client.budgets.storeBudgetLimit(diningBudgetId, {
        budget_id: diningBudgetId,
        start: startDate,
        end: endDate,
        amount: '200.00',
    });

    await client.budgets.storeBudgetLimit(entertBudgetId, {
        budget_id: entertBudgetId,
        start: startDate,
        end: endDate,
        amount: '100.00',
    });

    console.log(`  ✓ Groceries ($500), Dining ($200), Entertainment ($100)`);

    // ── Transactions ─────────────────────────────────────────────────────────────

    console.log('Creating transactions...');

    // Paycheck — arrives on the 1st
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'deposit',
                date: date(1),
                amount: '4000.00',
                description: 'Monthly Paycheck',
                source_id: employerId,
                destination_id: checkingId,
                tags: ['Paycheck'],
            },
        ],
    });

    // Rent bill — paid on the 1st
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(1),
                amount: '1500.00',
                description: 'Monthly Rent',
                source_id: checkingId,
                destination_name: 'Test Landlord',
                bill_id: rentBillId,
            },
        ],
    });

    // Netflix bill — paid on the 5th
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(5),
                amount: '15.99',
                description: 'Netflix Subscription',
                source_id: checkingId,
                destination_id: netflixExpId,
                bill_id: netflixBillId,
            },
        ],
    });

    // Groceries run — week 1
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(3),
                amount: '120.00',
                description: 'Weekly Grocery Run',
                source_id: checkingId,
                destination_id: groceriesExpId,
                budget_id: groceryBudgetId,
                category_name: 'Groceries',
            },
        ],
    });

    // Dining — week 1
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(7),
                amount: '65.00',
                description: 'Friday Night Dinner',
                source_id: checkingId,
                destination_id: diningExpId,
                budget_id: diningBudgetId,
                category_name: 'Dining',
            },
        ],
    });

    // Groceries run — week 2
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(10),
                amount: '95.00',
                description: 'Weekly Grocery Run',
                source_id: checkingId,
                destination_id: groceriesExpId,
                budget_id: groceryBudgetId,
                category_name: 'Groceries',
            },
        ],
    });

    // Unbudgeted — gas (has no budget)
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(12),
                amount: '55.00',
                description: 'Gas Station Fill-up',
                source_id: checkingId,
                destination_id: gasExpId,
                category_name: 'Transportation',
            },
        ],
    });

    // Dining — week 2
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(14),
                amount: '40.00',
                description: 'Lunch with Colleagues',
                source_id: checkingId,
                destination_id: diningExpId,
                budget_id: diningBudgetId,
                category_name: 'Dining',
            },
        ],
    });

    // Side income — freelance payment mid-month
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'deposit',
                date: date(15),
                amount: '350.00',
                description: 'Freelance Project Payment',
                source_id: sideIncomeId,
                destination_id: checkingId,
            },
        ],
    });

    // Savings transfer — mid-month top-up
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'transfer',
                date: date(15),
                amount: '500.00',
                description: 'Savings to Checking Transfer',
                source_id: savingsId,
                destination_id: checkingId,
            },
        ],
    });

    // Groceries run — week 3
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(17),
                amount: '140.00',
                description: 'Weekly Grocery Run',
                source_id: checkingId,
                destination_id: groceriesExpId,
                budget_id: groceryBudgetId,
                category_name: 'Groceries',
            },
        ],
    });

    // Uncategorized withdrawal — tagged for categorize E2E test
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(18),
                amount: '30.00',
                description: 'Online Purchase',
                source_id: checkingId,
                destination_id: miscExpId,
                tags: ['e2e-test'],
            },
        ],
    });

    // Dining — week 3
    await client.transactions.storeTransaction({
        transactions: [
            {
                type: 'withdrawal',
                date: date(19),
                amount: '25.00',
                description: 'Coffee and Lunch',
                source_id: checkingId,
                destination_id: diningExpId,
                budget_id: diningBudgetId,
                category_name: 'Dining',
            },
        ],
    });

    console.log('  ✓ 13 transactions created');
    console.log('    - Paycheck: $4,000 (tagged Paycheck)');
    console.log('    - Bills: Rent $1,500 + Netflix $15.99');
    console.log('    - Groceries: $355 / $500 budget');
    console.log('    - Dining: $130 / $200 budget');
    console.log('    - Unbudgeted: Gas $55 + misc $30');
    console.log('    - Additional income: Freelance $350');
    console.log('    - Savings transfer: $500 (Savings → Checking)');
    console.log('    - 1 uncategorized transaction tagged "e2e-test"');

    // ── Write e2e-config.yaml ────────────────────────────────────────────────────

    const expenseSourceAccountIds = [checkingId, savingsId];
    const configContent = `# Auto-generated by scripts/seed-test-data.ts — do not edit manually
# Run "npm run seed:docker" to regenerate after recreating the Docker environment
expectedMonthlyPaycheck: 4000
incomeDestinationAccounts:
  - '${checkingId}'
expenseSourceAccounts:
${expenseSourceAccountIds.map(id => `  - '${id}'`).join('\n')}
expenseTransfers: []
disposableIncomeAccounts: []
excludedAdditionalIncomePatterns:
  - 'PAYROLL'
`;

    const configPath = path.join(import.meta.dirname, 'e2e-config.yaml');
    fs.writeFileSync(configPath, configContent);

    console.log('\n✅ e2e-config.yaml updated with real account IDs');
    console.log('\nRun: npm run test:e2e:docker');
}

seed().catch(err => {
    console.error('\n❌ Seed failed:', err?.message ?? err);
    process.exit(1);
});
