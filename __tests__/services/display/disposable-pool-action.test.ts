import { disposablePoolAction } from '../../../src/services/display/disposable-pool-action.js';

describe('disposablePoolAction', () => {
    it('[R-DISP-1] asks for a transfer from the pool when tagged spending is positive', () => {
        expect(disposablePoolAction(42.5)).toEqual({ direction: 'fromPool', amount: 42.5 });
    });

    it('[R-DISP-1] inverts the instruction when refunds exceed tagged spending', () => {
        expect(disposablePoolAction(-12.3)).toEqual({ direction: 'toPool', amount: 12.3 });
    });

    it('asks for nothing when the total rounds to zero cents', () => {
        expect(disposablePoolAction(100.1 - 100 - 0.1)).toBeNull();
    });
});
