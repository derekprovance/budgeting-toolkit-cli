export default {
    preset: 'ts-jest/presets/default-esm',
    testEnvironment: 'node',
    extensionsToTreatAsEsm: ['.ts'],
    testMatch: ['**/__tests__/**/*.test.ts'],
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
                    rootDir: undefined,
                },
            },
        ],
    },
};
