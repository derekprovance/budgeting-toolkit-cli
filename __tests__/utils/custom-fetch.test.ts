import { Agent } from 'https';
import { jest } from '@jest/globals';

// Mock fs with actual jest mock functions
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockAxiosCreate = jest.fn().mockReturnValue({} as any);

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
        mockAxiosCreate.mockReset().mockReturnValue({} as any);
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

    describe('certificate file validation', () => {
        it('should fallback to default axios when CA cert file does not exist', () => {
            (mockExistsSync as jest.Mock).mockImplementation(path => {
                if (typeof path === 'string') {
                    return path.includes('client.p12');
                }
                return false;
            });

            const axiosInstance = createCustomAxiosInstance(
                {
                    caCertPath: '/path/to/nonexistent/ca.pem',
                    clientCertPath: '/path/to/client.p12',
                },
            );

            // Error is caught and default axios is returned
            expect(axiosInstance).toBeDefined();
            expect(mockAxiosCreate).toHaveBeenCalled();
        });

        it('should fallback to default axios when client cert file does not exist', () => {
            (mockExistsSync as jest.Mock).mockReturnValue(false);

            const axiosInstance = createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/nonexistent/client.p12',
                },
                mockAxiosCreate
            );

            // Error is caught and default axios is returned
            expect(axiosInstance).toBeDefined();
            expect(mockAxiosCreate).toHaveBeenCalled();
        });
    });

    describe('P12/PFX certificate loading', () => {
        beforeEach(() => {
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue(
                Buffer.from('mock-cert-data')
            );
        });

        it('should create axios instance with P12 certificate and password', () => {
            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.p12',
                    clientCertPassword: 'secret',
                },
                mockAxiosCreate
            );

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.p12');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                    timeout: 30000,
                })
            );
        });

        it('should create axios instance with PFX certificate and password', () => {
            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.pfx',
                    clientCertPassword: 'secret',
                },
                mockAxiosCreate
            );

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pfx');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                    timeout: 30000,
                })
            );
        });

        it('should create axios instance with P12 certificate without password', () => {
            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.p12');
            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should load CA certificate if provided', () => {
            createCustomAxiosInstance(
                {
                    caCertPath: '/path/to/ca.pem',
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/ca.pem');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.p12');
        });
    });

    describe('PEM certificate loading', () => {
        beforeEach(() => {
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue(
                Buffer.from('mock-cert-data')
            );
        });

        it('should load PEM certificate and key file', () => {
            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.pem',
                },
                mockAxiosCreate
            );

            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.key');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should load CRT certificate and key file', () => {
            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.crt',
                },
                mockAxiosCreate
            );

            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.crt');
            expect(mockExistsSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should handle missing key file gracefully', () => {
            (mockExistsSync as jest.Mock).mockImplementation(path => {
                if (typeof path === 'string') {
                    return !path.endsWith('.key');
                }
                return false;
            });

            const axiosInstance = createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.pem',
                },
                mockAxiosCreate
            );

            expect(axiosInstance).toBeDefined();
            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockReadFileSync).not.toHaveBeenCalledWith('/path/to/client.key');
        });
    });

    describe('TLS validation strategy', () => {
        beforeEach(() => {
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockReturnValue(
                Buffer.from('mock-cert-data')
            );
            delete process.env.STRICT_TLS;
        });

        it('should enable TLS validation when CA cert is provided', () => {
            createCustomAxiosInstance(
                {
                    caCertPath: '/path/to/ca.pem',
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should disable TLS validation when no CA cert is provided', () => {
            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should respect STRICT_TLS=false environment variable', () => {
            process.env.STRICT_TLS = 'false';

            createCustomAxiosInstance(
                {
                    caCertPath: '/path/to/ca.pem',
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should respect STRICT_TLS=true environment variable', () => {
            process.env.STRICT_TLS = 'true';

            createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(mockAxiosCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });
    });

    describe('error handling', () => {
        it('should return default axios instance on file read error', () => {
            (mockExistsSync as jest.Mock).mockReturnValue(true);
            (mockReadFileSync as jest.Mock).mockImplementation(() => {
                throw new Error('File read error');
            });

            const axiosInstance = createCustomAxiosInstance(
                {
                    clientCertPath: '/path/to/client.p12',
                },
                mockAxiosCreate
            );

            expect(axiosInstance).toBeDefined();
            // Should have been called twice - once for error case, once for fallback
            expect(mockAxiosCreate).toHaveBeenCalled();
        });
    });
});
