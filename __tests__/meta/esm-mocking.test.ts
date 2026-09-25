/**
 * Canary: `jest.mock` is inert under native ESM in this project.
 *
 * Jest runs these tests as native ES modules (`--experimental-vm-modules`,
 * ts-jest `useESM`). In that mode `jest.mock(...)` is not hoisted above the
 * static `import` statements, and it does not intercept ES module linking at
 * all, so a static import always receives the real module. A `jest.mock` call
 * in a test file therefore looks like it isolates a dependency while silently
 * doing nothing. Tests in this repo inject manual mocks through constructors
 * instead; where a module genuinely has to be replaced, use
 * `jest.unstable_mockModule(...)` followed by a dynamic `import()`.
 *
 * If this canary ever fails, the runtime changed: `jest.mock` has started to
 * work, and every test that was written assuming it is inert should be
 * re-audited.
 */
import { describe, expect, jest, test } from '@jest/globals';
import { StringUtils } from '../../src/utils/string.utils.js';

jest.mock('../../src/utils/string.utils.js', () => ({
    StringUtils: {
        normalizeForMatching: () => 'MOCKED',
    },
}));

describe('ESM mocking canary', () => {
    test('jest.mock does not replace a statically imported ES module', () => {
        expect(StringUtils.normalizeForMatching('  Groceries  ')).toBe('groceries');
    });

    test('jest.unstable_mockModule + dynamic import does replace a module', async () => {
        jest.unstable_mockModule('../../src/utils/currency.utils.js', () => ({
            CurrencyUtils: { canary: () => 'MOCKED' },
        }));

        const mod = (await import('../../src/utils/currency.utils.js')) as unknown as {
            CurrencyUtils: { canary: () => string };
        };

        expect(mod.CurrencyUtils.canary()).toBe('MOCKED');
    });
});
