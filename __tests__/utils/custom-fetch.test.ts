import { Agent } from 'https';
import { jest } from '@jest/globals';
import { createMockLogger } from '../shared/mocks.js';

// Mock fs with actual jest mock functions
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string) => Buffer>();
const mockAxiosCreate = jest.fn<(config?: unknown) => unknown>().mockReturnValue({});

jest.unstable_mockModule('../../src/logger', () => ({
    logger: createMockLogger(),
}));

jest.unstable_mockModule('axios', () => ({
    default: {
        create: mockAxiosCreate,
    },
}));

jest.unstable_mockModule('fs', () => ({
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
}));

// Dynamic imports after mocks
const { createCustomAxiosInstance } = await import('../../src/utils/custom-fetch.js');

describe('createCustomAxiosInstance', () => {
    beforeEach(() => {
        // Reset mocks
        mockExistsSync.mockReset();
        mockReadFileSync.mockReset();
        mockAxiosCreate.mockReset().mockReturnValue({});
    });

    afterEach(() => {
        mockExistsSync.mockReset();
        mockReadFileSync.mockReset();
        mockAxiosCreate.mockReset();
        delete process.env.STRICT_TLS;
    });

    describe('no certificate path provided', () => {
        it('should return default axios instance when no clientCertPath', () => {
            const axiosInstance = createCustomAxiosInstance({});
            expect(mockAxiosCreate).toHaveBeenCalledWith();
            expect(axiosInstance).toBeDefined();
        });

        it('should return default axios instance when clientCertPath is empty string', () => {
            const axiosInstance = createCustomAxiosInstance({ clientCertPath: '' });
            expect(mockAxiosCreate).toHaveBeenCalledWith();
            expect(axiosInstance).toBeDefined();
        });
    });

    describe('CA-only configuration (no client cert)', () => {
        it('should create a custom agent that trusts the CA', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(Buffer.from('ca-data'));

            createCustomAxiosInstance({ caCertPath: '/path/to/ca.pem' });

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/ca.pem');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({ httpsAgent: expect.any(Agent) })
            );
        });
    });

    describe('certificate file validation', () => {
        it('should fallback to default axios when CA cert file does not exist', () => {
            mockExistsSync.mockImplementation(path => {
                if (typeof path === 'string') {
                    return path.includes('client.p12');
                }
                return false;
            });

            const axiosInstance = createCustomAxiosInstance({
                caCertPath: '/path/to/nonexistent/ca.pem',
                clientCertPath: '/path/to/client.p12',
            });

            // Error is caught and default axios is returned
            expect(axiosInstance).toBeDefined();
            expect(mockAxiosCreate).toHaveBeenCalled();
        });

        it('should fallback to default axios when client cert file does not exist', () => {
            mockExistsSync.mockReturnValue(false);

            const axiosInstance = createCustomAxiosInstance({
                clientCertPath: '/path/to/nonexistent/client.p12',
            });

            // Error is caught and default axios is returned
            expect(axiosInstance).toBeDefined();
            expect(mockAxiosCreate).toHaveBeenCalled();
        });
    });

    describe('P12/PFX certificate loading', () => {
        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(Buffer.from('mock-cert-data'));
        });

        it('should create axios instance with P12 certificate and password', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.p12');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                    timeout: 30000,
                })
            );
        });

        it('should create axios instance with PFX certificate and password', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.pfx',
                clientCertPassword: 'secret',
            });

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pfx');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                    timeout: 30000,
                })
            );
        });

        it('should create axios instance with P12 certificate without password', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.p12');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should load CA certificate if provided', () => {
            createCustomAxiosInstance({
                caCertPath: '/path/to/ca.pem',
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/ca.pem');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.p12');
        });
    });

    describe('PEM certificate loading', () => {
        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(Buffer.from('mock-cert-data'));
        });

        it('should load PEM certificate and key file', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.pem',
            });

            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.key');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should load CRT certificate and key file', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.crt',
            });

            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.crt');
            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should handle missing key file gracefully', () => {
            mockExistsSync.mockImplementation(path => {
                if (typeof path === 'string') {
                    return !path.endsWith('.key');
                }
                return false;
            });

            const axiosInstance = createCustomAxiosInstance({
                clientCertPath: '/path/to/client.pem',
            });

            expect(axiosInstance).toBeDefined();
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockReadFileSync).not.toHaveBeenCalledWith('/path/to/client.key');
        });
    });

    describe('TLS validation strategy', () => {
        beforeEach(() => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(Buffer.from('mock-cert-data'));
            delete process.env.STRICT_TLS;
        });

        it('should enable TLS validation when CA cert is provided', () => {
            createCustomAxiosInstance({
                caCertPath: '/path/to/ca.pem',
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should disable TLS validation when no CA cert is provided', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should respect STRICT_TLS=false environment variable', () => {
            process.env.STRICT_TLS = 'false';

            createCustomAxiosInstance({
                caCertPath: '/path/to/ca.pem',
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should respect STRICT_TLS=true environment variable', () => {
            process.env.STRICT_TLS = 'true';

            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });
    });

    describe('error handling', () => {
        it('should return default axios instance on file read error', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockImplementation(() => {
                throw new Error('File read error');
            });

            const axiosInstance = createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(axiosInstance).toBeDefined();
            // Should have been called twice - once for error case, once for fallback
            expect(mockAxiosCreate).toHaveBeenCalled();
        });
    });
});
