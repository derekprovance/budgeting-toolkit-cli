module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/setup/', // Test utilities and mocks
        '/__tests__/shared/', // Shared test data
    ],
};
