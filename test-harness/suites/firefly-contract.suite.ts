/**
 * Firefly III's own server behavior for the seeded scenario, asserted against
 * the literals in scenario/firefly-contract.ts. Runs against the fake server
 * in-process and against real Firefly in e2e; the same literals must pass
 * both.
 *
 * `getJson(path)` receives an API path beginning with `/v1/` (relative to the
 * `/api` root, query string included) and resolves the parsed JSON body.
 */
import { describe, expect, test } from '@jest/globals';
import {
    ASSET_ACCOUNTS_ACTIVE,
    BILL_AMOUNT_AVG,
    BILL_PAY_DATES,
    CC_READBACK,
    CONTRACT_PAGE_LIMIT,
    INACTIVE_BILLS,
    MONTH_RANGES,
    NO_NAME_REVENUE,
    PAGINATION_BEHAVIOR,
    PRIMARY_CURRENCY,
    TRANSACTION_PAGINATION,
    TRANSACTIONS_BY_MONTH,
    UNCAPPED_PROBE_LIMIT,
    UNKNOWN_TAG,
    WIRE_FORMAT,
} from '../scenario/firefly-contract.js';
import type { AccountKey, BillKey, IdMap, MonthId } from '../scenario/types.js';
import { reverseIdMap, sorted } from './helpers.js';

export type GetJson = (path: string) => Promise<unknown>;

interface Paginated<T> {
    data: T[];
    meta?: { pagination?: { total?: number; total_pages?: number } };
}
interface SplitAttrs {
    transaction_journal_id: string;
    type: string;
    amount: string;
    date: string;
    budget_id?: string | null;
    source_name?: string | null;
    source_type?: string | null;
}
interface GroupRead {
    id: string;
    attributes: { transactions: SplitAttrs[] };
}
interface BillRead {
    id: string;
    attributes: { active?: boolean; pay_dates?: string[]; amount_avg?: string | null };
}
interface AccountRead {
    id: string;
    attributes: {
        active?: boolean;
        account_role?: string | null;
        credit_card_type?: string | null;
        monthly_payment_date?: string | null;
    };
}

const MONTHS = Object.keys(MONTH_RANGES) as MonthId[];
const range = (m: MonthId) => `start=${MONTH_RANGES[m].start}&end=${MONTH_RANGES[m].end}`;

async function allPages<T>(getJson: GetJson, path: string, limit = 500): Promise<T[]> {
    const out: T[] = [];
    const sep = path.includes('?') ? '&' : '?';
    for (let page = 1; page <= 100; page++) {
        const body = (await getJson(`${path}${sep}limit=${limit}&page=${page}`)) as Paginated<T>;
        out.push(...body.data);
        const total = body.meta?.pagination?.total_pages ?? 1;
        if (page >= total) break;
    }
    return out;
}

export function defineFireflyContractSuite(getJson: GetJson, idMap: IdMap | (() => IdMap)): void {
    const ids = typeof idMap === 'function' ? idMap : () => idMap;

    const journalKeys = (groups: GroupRead[]) => {
        const r = reverseIdMap(ids());
        return groups
            .flatMap(g => g.attributes.transactions)
            .map(
                s =>
                    r.journal.get(String(s.transaction_journal_id)) ??
                    `?${s.transaction_journal_id}`
            )
            .sort();
    };

    describe('Firefly contract', () => {
        describe.each(MONTHS)('%s', month => {
            test('transactions: groups in month, inclusive end date (V16)', async () => {
                const groups = await allPages<GroupRead>(
                    getJson,
                    `/v1/transactions?${range(month)}`
                );
                expect(journalKeys(groups)).toEqual(sorted(TRANSACTIONS_BY_MONTH[month]));
            });

            // V14: limit honored
            test(`transactions: pagination at limit=${CONTRACT_PAGE_LIMIT}`, async () => {
                const body = (await getJson(
                    `/v1/transactions?${range(month)}&limit=${CONTRACT_PAGE_LIMIT}&page=1`
                )) as Paginated<GroupRead>;
                const expected = TRANSACTION_PAGINATION[month];
                expect({
                    total: body.meta?.pagination?.total,
                    totalPages: body.meta?.pagination?.total_pages,
                    firstPage: body.data.length,
                }).toEqual({
                    ...expected,
                    firstPage: Math.min(CONTRACT_PAGE_LIMIT, expected.total),
                });
            });

            // V11: a bill paid in the window reports its NEXT date
            test('bills: pay_dates for the window', async () => {
                const bills = await allPages<BillRead>(getJson, `/v1/bills?${range(month)}`);
                const r = reverseIdMap(ids());
                const actual = Object.fromEntries(
                    bills.map(b => [
                        r.bill.get(String(b.id)) ?? `?${b.id}`,
                        (b.attributes.pay_dates ?? []).map(d => d.slice(0, 10)).sort(),
                    ])
                );
                expect(actual).toEqual(BILL_PAY_DATES[month]);
            });
        });

        test('bills: amount_avg is (min + max) / 2 (V11)', async () => {
            const bills = await allPages<BillRead>(getJson, `/v1/bills?${range('2025-01')}`);
            const r = reverseIdMap(ids());
            const actual = Object.fromEntries(
                bills.map(b => [
                    r.bill.get(String(b.id)) ?? `?${b.id}`,
                    Number(b.attributes.amount_avg),
                ])
            );
            expect(actual).toEqual(BILL_AMOUNT_AVG);
        });

        test('transactions: no server-side page cap (V14)', async () => {
            const body = (await getJson(
                `/v1/transactions?${range('2025-01')}&limit=${UNCAPPED_PROBE_LIMIT}&page=1`
            )) as Paginated<GroupRead> & { meta: { pagination: { per_page?: number } } };
            expect(body.meta.pagination.per_page).toBe(UNCAPPED_PROBE_LIMIT);
            expect(body.data).toHaveLength(TRANSACTION_PAGINATION['2025-01'].total);
        });

        test('transactions: per_page defaults when limit is omitted (V14)', async () => {
            const body = (await getJson(
                `/v1/transactions?${range('2025-01')}`
            )) as Paginated<GroupRead> & {
                meta: { pagination: { per_page?: number } };
            };
            expect(body.meta.pagination.per_page).toBe(PAGINATION_BEHAVIOR.defaultLimit);
        });

        test('transactions: wire format and no budget on non-withdrawals (V8)', async () => {
            const groups = await allPages<GroupRead>(
                getJson,
                `/v1/transactions?${range('2025-01')}`
            );
            for (const split of groups.flatMap(g => g.attributes.transactions)) {
                expect(split.amount).toMatch(WIRE_FORMAT.amountPattern);
                expect(split.date).toMatch(WIRE_FORMAT.datePattern);
                if (split.type !== 'withdrawal') {
                    expect(split.budget_id ?? null).toBeNull();
                }
            }
        });

        test('accounts: ccAsset card fields read back as null (V6)', async () => {
            const body = (await getJson(`/v1/accounts/${ids().accounts.CC}`)) as {
                data: AccountRead;
            };
            const a = body.data.attributes;
            expect({
                accountRole: a.account_role,
                creditCardType: a.credit_card_type ?? null,
                monthlyPaymentDate: a.monthly_payment_date ?? null,
            }).toEqual(CC_READBACK);
        });

        test('bills: deactivated bills are still listed, inactive (V11)', async () => {
            const bills = await allPages<BillRead>(getJson, '/v1/bills');
            const r = reverseIdMap(ids());
            const inactive = bills
                .filter(b => b.attributes.active === false)
                .map(b => r.bill.get(String(b.id)) ?? `?${b.id}`);
            expect(sorted(inactive)).toEqual(sorted<BillKey>(INACTIVE_BILLS));
            expect(bills).toHaveLength(Object.keys(ids().bills).length);
        });

        // V15
        test('accounts: inactive asset accounts are listed with active=false', async () => {
            const accounts = await allPages<AccountRead>(getJson, '/v1/accounts?type=asset');
            const byId = new Map(accounts.map(a => [String(a.id), a]));
            const actual = Object.fromEntries(
                (Object.entries(ids().accounts) as [AccountKey, string][]).map(([key, id]) => [
                    key,
                    byId.get(String(id))?.attributes.active ?? 'missing',
                ])
            );
            expect(actual).toEqual(ASSET_ACCOUNTS_ACTIVE);
        });

        // V12
        test('deposits without a source land on the "(no name)" revenue account', async () => {
            for (const key of NO_NAME_REVENUE.transactions) {
                const body = (await getJson(
                    `/v1/transactions/${ids().transactions[key].groupId}`
                )) as { data: GroupRead };
                const split = body.data.attributes.transactions[0];
                expect({ key, name: split.source_name, type: split.source_type }).toEqual({
                    key,
                    name: NO_NAME_REVENUE.sourceName,
                    type: NO_NAME_REVENUE.sourceType,
                });
            }
        });

        // V23: getJson rejects on any non-200, naming the status
        test('an unknown tag is a 404', async () => {
            await expect(getJson(`/v1/tags/${UNKNOWN_TAG.tag}`)).rejects.toThrow(
                new RegExp(`\\b${UNKNOWN_TAG.status}\\b`)
            );
        });

        // V13
        test('primary currency is USD', async () => {
            const body = (await getJson('/v1/currencies/primary')) as {
                data: { attributes: { code: string; symbol: string } };
            };
            expect({
                code: body.data.attributes.code,
                symbol: body.data.attributes.symbol,
            }).toEqual(PRIMARY_CURRENCY);
        });
    });
}
