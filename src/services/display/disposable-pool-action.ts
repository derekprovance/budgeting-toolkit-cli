import { CurrencyUtils } from '../../utils/currency.utils.js';

export type DisposablePoolDirection = 'fromPool' | 'toPool';

export interface DisposablePoolAction {
    direction: DisposablePoolDirection;
    /** Positive, rounded to cents */
    amount: number;
}

/**
 * What the owner still has to move to or from the disposable pool (R-DISP-1).
 *
 * `disposableIncome` is net of refunds and not floored at zero, so a negative
 * total inverts the instruction rather than becoming a negative transfer. The
 * direction is decided on the cent-rounded total, so float noise from refunds
 * that cancel spending never asks for a $0.00 transfer.
 *
 * @returns `null` when nothing needs to move
 */
export function disposablePoolAction(disposableIncome: number): DisposablePoolAction | null {
    const balance = CurrencyUtils.toCents(disposableIncome);
    if (balance === 0) {
        return null;
    }
    return balance > 0
        ? { direction: 'fromPool', amount: balance }
        : { direction: 'toPool', amount: -balance };
}
