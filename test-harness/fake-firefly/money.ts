/**
 * Fixed-point money for the fake server, 12 decimals like Firefly's wire
 * format. Deliberately self-contained: the fake must not reuse any arithmetic
 * from src/.
 */

const SCALE = 12;
const FACTOR = 10n ** BigInt(SCALE);

/** Parses "12.34", 12.34 or "12.340000000000" into units of 1e-12; throws on junk */
export function parseMoney(value: unknown): bigint {
    const raw = typeof value === 'number' ? value.toString() : String(value ?? '').trim();
    const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(raw);
    if (!match) {
        throw new Error(`Invalid amount: ${JSON.stringify(value)}`);
    }
    const [, minus, whole, frac = ''] = match;
    const fracPadded = (frac + '0'.repeat(SCALE)).slice(0, SCALE);
    const units = BigInt(whole) * FACTOR + BigInt(fracPadded);
    return minus ? -units : units;
}

/** Formats with `decimals` places (truncating beyond), e.g. "1000.000000000000" */
export function formatMoney(units: bigint, decimals = SCALE): string {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const whole = abs / FACTOR;
    const frac = (abs % FACTOR).toString().padStart(SCALE, '0').slice(0, decimals);
    const body = decimals > 0 ? `${whole}.${frac}` : `${whole}`;
    return negative ? `-${body}` : body;
}
