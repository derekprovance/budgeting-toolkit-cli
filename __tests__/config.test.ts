import { jest } from '@jest/globals';

// Create mock functions
const mockExistsSync = jest.fn();
const mockGetConfigValue = jest.fn().mockReturnValue(undefined);

// Use unstable_mockModule for ESM mocking
jest.unstable_mockModule('../src/utils/config-loader', () => ({
    getConfigValue: mockGetConfigValue,
}));

jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: jest.fn(),
}));

// Dynamic imports after mocks
const { validateCertificateConfig } = await import('../src/config.js');
const { FireflyClientWithCertsConfig } = await import('../src/api/firefly-client-with-certs.js');

describe('validateCertificateConfig', () => {
    beforeEach(() => {
        mockExistsSync.mockReset();
    });

    afterEach(() => {
        mockExistsSync.mockReset();
    });

    it('should not throw when no certificate path is provided', () => {
        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
        };

        expect(() => validateCertificateConfig(config)).not.toThrow();
    });

    it('should not throw when certificate paths exist', () => {
        (mockExistsSync as jest.Mock).mockReturnValue(true);

        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
            clientCertPath: '/path/to/client.p12',
            caCertPath: '/path/to/ca.pem',
        };

        expect(() => validateCertificateConfig(config)).not.toThrow();
        expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.p12');
        expect(mockExistsSync).toHaveBeenCalledWith('/path/to/ca.pem');
    });

    it('should throw when client certificate does not exist', () => {
        (mockExistsSync as jest.Mock).mockReturnValue(false);

        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
            clientCertPath: '/path/to/nonexistent.p12',
        };

        expect(() => validateCertificateConfig(config)).toThrow(
            /Client certificate not found: \/path\/to\/nonexistent\.p12/
        );
    });

    it('should throw when CA certificate does not exist', () => {
        (mockExistsSync as jest.Mock).mockImplementation(path => {
            // Client cert exists, CA cert does not
            return path === '/path/to/client.p12';
        });

        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
            clientCertPath: '/path/to/client.p12',
            caCertPath: '/path/to/nonexistent-ca.pem',
        };

        expect(() => validateCertificateConfig(config)).toThrow(
            /CA certificate not found: \/path\/to\/nonexistent-ca\.pem/
        );
    });

    it('should throw with multiple errors when both certificates are missing', () => {
        (mockExistsSync as jest.Mock).mockReturnValue(false);

        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
            clientCertPath: '/path/to/nonexistent-client.p12',
            caCertPath: '/path/to/nonexistent-ca.pem',
        };

        expect(() => validateCertificateConfig(config)).toThrow(
            /Certificate configuration error/
        );
        expect(() => validateCertificateConfig(config)).toThrow(
            /Client certificate not found/
        );
        expect(() => validateCertificateConfig(config)).toThrow(
            /CA certificate not found/
        );
    });

    it('should not check CA cert if not provided', () => {
        (mockExistsSync as jest.Mock).mockReturnValue(true);

        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
            clientCertPath: '/path/to/client.p12',
            // No caCertPath
        };

        expect(() => validateCertificateConfig(config)).not.toThrow();
        expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.p12');
        expect(mockExistsSync).toHaveBeenCalledTimes(1); // Only client cert checked
    });
});
