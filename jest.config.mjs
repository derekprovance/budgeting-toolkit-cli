export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    testMatch: ['**/__tests__/**/*.test.ts'],
    // e2e/ runs under its own Jest project against Docker; test-harness/ holds
    // shared suites and fixtures that are only ever run through a test file.
    // .claude/ holds agent worktrees: whole checkouts of this repo.
    testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/test-harness/', '/.claude/'],
    modulePathIgnorePatterns: ['<rootDir>/.claude/'],
    globalSetup: '<rootDir>/__tests__/setup/global-setup.ts',
    globalTeardown: '<rootDir>/__tests__/setup/global-teardown.ts',
    setupFiles: ['<rootDir>/__tests__/setup/env.ts'],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/setup/', // Test utilities and mocks
        '/__tests__/shared/', // Shared test data
    ],
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
                    // Allow test files to import from anywhere
                    rootDir: '.',
                },
            },
        ],
    },
};
