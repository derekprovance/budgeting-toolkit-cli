import { jest } from '@jest/globals';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    resolvePageSize,
} from '../../src/utils/pagination.utils.js';
import { ILogger } from '../../src/types/interface/logger.interface.js';

const makeLogger = () =>
    ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }) as unknown as ILogger & { warn: jest.Mock };

describe('resolvePageSize (BTK_PAGE_SIZE)', () => {
    it('defaults to 500 when unset', () => {
        const logger = makeLogger();
        expect(DEFAULT_PAGE_SIZE).toBe(500);
        expect(MAX_PAGE_SIZE).toBe(500);
        expect(resolvePageSize(undefined, logger)).toBe(500);
        expect(resolvePageSize('', logger)).toBe(500);
        expect(resolvePageSize('   ', logger)).toBe(500);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each([
        ['1', 1],
        ['10', 10],
        ['500', 500],
        [' 25 ', 25],
    ])('accepts %p as %p', (raw, expected) => {
        const logger = makeLogger();
        expect(resolvePageSize(raw, logger)).toBe(expected);
        expect(logger.warn).not.toHaveBeenCalled();
    });

    it.each(['0', '501', '-5', '10.5', '1e2', 'abc', '10abc', '0x10', 'Infinity'])(
        'falls back to 500 and warns for %p',
        raw => {
            const logger = makeLogger();
            expect(resolvePageSize(raw, logger)).toBe(500);
            expect(logger.warn).toHaveBeenCalledTimes(1);
            expect(logger.warn).toHaveBeenCalledWith(
                { BTK_PAGE_SIZE: raw, fallback: 500 },
                expect.stringContaining('BTK_PAGE_SIZE')
            );
        }
    );
});

describe('PAGE_SIZE module constant', () => {
    const original = process.env.BTK_PAGE_SIZE;

    afterEach(() => {
        if (original === undefined) {
            delete process.env.BTK_PAGE_SIZE;
        } else {
            process.env.BTK_PAGE_SIZE = original;
        }
    });

    it('is resolved from BTK_PAGE_SIZE at module load', async () => {
        process.env.BTK_PAGE_SIZE = '10';
        await jest.isolateModulesAsync(async () => {
            const mod = await import('../../src/utils/pagination.utils.js');
            expect(mod.PAGE_SIZE).toBe(10);
        });
    });

    it('is 500 when BTK_PAGE_SIZE is invalid', async () => {
        process.env.BTK_PAGE_SIZE = 'nope';
        await jest.isolateModulesAsync(async () => {
            const mod = await import('../../src/utils/pagination.utils.js');
            expect(mod.PAGE_SIZE).toBe(500);
        });
    });
});
