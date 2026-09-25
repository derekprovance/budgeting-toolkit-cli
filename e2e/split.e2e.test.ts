/**
 * `split` against real Firefly, in the 2025-04 sandbox month (never asserted
 * by the analyze/report suites). The transaction is created over the API and
 * deleted afterwards.
 */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { api, readIdMap } from './helpers/e2e-env.js';
import { runCli } from './helpers/run-cli.js';

const idMap = readIdMap();
const DESCRIPTION = 'E2E Split Sandbox';
const TAG = 'e2e-split-sandbox';
const CATEGORY = 'E2E Split';

interface Split {
    transaction_journal_id: string;
    type: string;
    date: string;
    amount: string;
    description: string;
    source_id: string;
    destination_id: string;
    budget_id: string | null;
    category_name: string | null;
    tags: string[] | null;
}
interface Group {
    data: { id: string; attributes: { group_title: string | null; transactions: Split[] } };
}

async function readGroup(id: string): Promise<Group['data']> {
    const { status, body } = await api(`/v1/transactions/${id}`);
    expect(status).toBe(200);
    return (body as Group).data;
}

describe('split', () => {
    let groupId: string;
    let original: Split;

    beforeAll(async () => {
        const { status, body } = await api('/v1/transactions', {
            method: 'POST',
            body: {
                apply_rules: false,
                fire_webhooks: false,
                error_if_duplicate_hash: false,
                transactions: [
                    {
                        type: 'withdrawal',
                        date: '2025-04-10',
                        amount: '50.00',
                        description: DESCRIPTION,
                        currency_code: 'USD',
                        source_id: idMap.accounts.CHK,
                        destination_name: 'Split Sandbox Store',
                        budget_id: idMap.budgets.Groceries,
                        category_name: CATEGORY,
                        tags: [TAG],
                    },
                ],
            },
        });
        if (status !== 200) {
            throw new Error(`creating the split sandbox failed: ${status} ${JSON.stringify(body)}`);
        }
        groupId = String((body as Group).data.id);
        original = (body as Group).data.attributes.transactions[0];
    });

    afterAll(async () => {
        if (groupId) await api(`/v1/transactions/${groupId}`, { method: 'DELETE' });
        await api(`/v1/tags/${encodeURIComponent(TAG)}`, { method: 'DELETE' });
    });

    test('an over-amount split is rejected and leaves the transaction unchanged', async () => {
        const r = await runCli(['split', groupId, '-a', '60.00', '-d', 'Part A', 'Part B', '-y']);
        expect(r.code).toBe(1);
        expect(r.text).toContain('Amount must be less than the original amount ($50)');

        const group = await readGroup(groupId);
        expect(group.attributes.transactions).toHaveLength(1);
        const s = group.attributes.transactions[0];
        expect({
            journal: s.transaction_journal_id,
            amount: Number(s.amount),
            description: s.description,
            budget: s.budget_id,
        }).toEqual({
            journal: original.transaction_journal_id,
            amount: 50,
            description: DESCRIPTION,
            budget: idMap.budgets.Groceries,
        });
    });

    test('splits 30 / 20: metadata on the first split only', async () => {
        const r = await runCli(['split', groupId, '-a', '30.00', '-d', 'Part A', 'Part B', '-y']);
        expect({ code: r.code, text: r.text }).toMatchObject({ code: 0 });
        expect(r.text).toContain('Transaction split successfully');

        const group = await readGroup(groupId);
        const splits = group.attributes.transactions;
        expect(splits).toHaveLength(2);
        expect(group.attributes.group_title).toBe(DESCRIPTION);

        const first = splits.find(s => Number(s.amount) === 30);
        const second = splits.find(s => Number(s.amount) === 20);
        expect(first).toBeDefined();
        expect(second).toBeDefined();

        const common = (s: Split) => ({
            type: s.type,
            date: s.date.slice(0, 10),
            source: String(s.source_id),
            destination: String(s.destination_id),
        });
        const expectedCommon = common(original);
        expect(common(first!)).toEqual(expectedCommon);
        expect(common(second!)).toEqual(expectedCommon);

        // First split: the original journal, with category, budget and tags
        expect({
            journal: first!.transaction_journal_id,
            description: first!.description,
            budget: first!.budget_id,
            category: first!.category_name,
            tags: first!.tags ?? [],
        }).toEqual({
            journal: original.transaction_journal_id,
            description: `${DESCRIPTION} Part A`,
            budget: idMap.budgets.Groceries,
            category: CATEGORY,
            tags: [TAG],
        });

        // Second split: a new journal, deliberately uncategorized
        expect({
            newJournal: second!.transaction_journal_id !== original.transaction_journal_id,
            description: second!.description,
            budget: second!.budget_id ?? null,
            category: second!.category_name ?? null,
            tags: second!.tags ?? [],
        }).toEqual({
            newJournal: true,
            description: `${DESCRIPTION} Part B`,
            budget: null,
            category: null,
            tags: [],
        });
    });
});
