import { existsSync } from 'fs';
import { validateCertificateConfig } from '../src/config';
import { FireflyClientWithCertsConfig } from '../src/api/firefly-client-with-certs';

jest.mock('fs');
jest.mock('../src/utils/config-loader', () => ({
    getConfigValue: jest.fn().mockReturnValue(undefined),
}));

describe('validateCertificateConfig', () => {
    const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should not throw when no certificate path is provided', () => {
        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
        };

        expect(() => validateCertificateConfig(config)).not.toThrow();
    });

    it('should not throw when certificate paths exist', () => {
        mockExistsSync.mockReturnValue(true);

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
        mockExistsSync.mockReturnValue(false);

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
        mockExistsSync.mockImplementation((path) => {
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
        mockExistsSync.mockReturnValue(false);

        const config: FireflyClientWithCertsConfig = {
            BASE: 'https://firefly.example.com/api',
            TOKEN: 'token',
            clientCertPath: '/path/to/nonexistent-client.p12',
            caCertPath: '/path/to/nonexistent-ca.pem',
        };

        expect(() => validateCertificateConfig(config)).toThrow(/Certificate configuration error/);
        expect(() => validateCertificateConfig(config)).toThrow(/Client certificate not found/);
        expect(() => validateCertificateConfig(config)).toThrow(/CA certificate not found/);
    });

    it('should not check CA cert if not provided', () => {
        mockExistsSync.mockReturnValue(true);

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
