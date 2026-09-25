/**
 * Jest project for the Docker e2e suite. Run through `npm run test:e2e`
 * (scripts/e2e/run.sh), which starts and seeds the btk-e2e stack first.
 */
export default {
    rootDir: '..',
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    testMatch: ['<rootDir>/e2e/**/*.e2e.test.ts'],
    testPathIgnorePatterns: ['/node_modules/'],
    globalSetup: '<rootDir>/e2e/global-setup.ts',
    testTimeout: 60000,
    maxWorkers: 1,
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                useESM: true,
                tsconfig: {
                    module: 'nodenext',
                    moduleResolution: 'nodenext',
                    isolatedModules: true,
                    rootDir: '.',
                },
            },
        ],
    },
};
