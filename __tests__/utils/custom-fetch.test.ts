import { Agent } from 'https';
import { jest } from '@jest/globals';

// Mock fs with actual jest mock functions
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string) => Buffer>();
const mockAxiosCreate = jest.fn<(config?: unknown) => unknown>().mockReturnValue({});

jest.unstable_mockModule('../../src/logger', () => ({
    logger: {
        debug: jest.fn<(obj: unknown, msg: string) => void>(),
        info: jest.fn<(obj: unknown, msg: string) => void>(),
        warn: jest.fn<(obj: unknown, msg: string) => void>(),
        error: jest.fn<(obj: unknown, msg: string) => void>(),
    },
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

    describe('CA-only configuration (no client cert)', () => {
        it('should create a custom agent that trusts the CA', () => {
            mockReadFileSync.mockReturnValue(Buffer.from('ca-data'));

            createCustomAxiosInstance({ caCertPath: '/path/to/ca.pem' });

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/ca.pem');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({ httpsAgent: expect.any(Agent) })
            );
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

            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.key');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should load CRT certificate and key file', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.crt',
            });

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
        // Falling back to plain axios would silently drop mTLS
        it('should throw, not fall back to plain axios, when a certificate cannot be read', () => {
            mockReadFileSync.mockImplementation(() => {
                throw new Error("ENOENT: no such file or directory, open '/path/to/client.p12'");
            });

            expect(() =>
                createCustomAxiosInstance({ clientCertPath: '/path/to/client.p12' })
            ).toThrow('ENOENT');
            expect(mockAxiosCreate).not.toHaveBeenCalled();
        });

        it('should throw when the CA certificate cannot be read', () => {
            mockReadFileSync.mockImplementation(path => {
                if (path === '/path/to/ca.pem') {
                    throw new Error("ENOENT: no such file or directory, open '/path/to/ca.pem'");
                }
                return Buffer.from('mock-cert-data');
            });

            expect(() =>
                createCustomAxiosInstance({
                    caCertPath: '/path/to/ca.pem',
                    clientCertPath: '/path/to/client.p12',
                })
            ).toThrow('/path/to/ca.pem');
            expect(mockAxiosCreate).not.toHaveBeenCalled();
        });
    });
});
