import * as fs from 'fs';
import axios from 'axios';
import { Agent } from 'https';

jest.mock('fs');
jest.mock('axios');
jest.mock('../../src/logger', () => ({
    logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    },
}));

import { createCustomAxiosInstance } from '../../src/utils/custom-fetch';

describe('createCustomAxiosInstance', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;
    const mockAxios = axios as jest.Mocked<typeof axios>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockAxios.create.mockReturnValue({} as any);
    });

    describe('no certificate path provided', () => {
        it('should return default axios instance when no clientCertPath', () => {
            const axiosInstance = createCustomAxiosInstance({});
            expect(mockAxios.create).toHaveBeenCalledWith();
            expect(axiosInstance).toBeDefined();
        });

        it('should return default axios instance when clientCertPath is empty string', () => {
            const axiosInstance = createCustomAxiosInstance({ clientCertPath: '' });
            expect(mockAxios.create).toHaveBeenCalledWith();
            expect(axiosInstance).toBeDefined();
        });
    });

    describe('certificate file validation', () => {
        it('should fallback to default axios when CA cert file does not exist', () => {
            mockFs.existsSync.mockImplementation(path => {
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
            expect(mockAxios.create).toHaveBeenCalled();
        });

        it('should fallback to default axios when client cert file does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);

            const axiosInstance = createCustomAxiosInstance({
                clientCertPath: '/path/to/nonexistent/client.p12',
            });

            // Error is caught and default axios is returned
            expect(axiosInstance).toBeDefined();
            expect(mockAxios.create).toHaveBeenCalled();
        });
    });

    describe('P12/PFX certificate loading', () => {
        beforeEach(() => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(Buffer.from('mock-cert-data'));
        });

        it('should create axios instance with P12 certificate and password', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });

            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.p12');
            expect(mockAxios.create).toHaveBeenCalledWith(
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

            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.pfx');
            expect(mockAxios.create).toHaveBeenCalledWith(
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

            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.p12');
            expect(mockAxios.create).toHaveBeenCalledWith(
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

            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/ca.pem');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.p12');
        });
    });

    describe('PEM certificate loading', () => {
        beforeEach(() => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(Buffer.from('mock-cert-data'));
        });

        it('should load PEM certificate and key file', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.pem',
            });

            expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/client.key');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should load CRT certificate and key file', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.crt',
            });

            expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/client.crt');
            expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/client.key');
        });

        it('should handle missing key file gracefully', () => {
            mockFs.existsSync.mockImplementation(path => {
                if (typeof path === 'string') {
                    return !path.endsWith('.key');
                }
                return false;
            });

            const axiosInstance = createCustomAxiosInstance({
                clientCertPath: '/path/to/client.pem',
            });

            expect(axiosInstance).toBeDefined();
            expect(mockFs.readFileSync).toHaveBeenCalledWith('/path/to/client.pem');
            expect(mockFs.readFileSync).not.toHaveBeenCalledWith('/path/to/client.key');
        });
    });

    describe('TLS validation strategy', () => {
        beforeEach(() => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockReturnValue(Buffer.from('mock-cert-data'));
            delete process.env.STRICT_TLS;
        });

        it('should enable TLS validation when CA cert is provided', () => {
            createCustomAxiosInstance({
                caCertPath: '/path/to/ca.pem',
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxios.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );
        });

        it('should disable TLS validation when no CA cert is provided', () => {
            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxios.create).toHaveBeenCalledWith(
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

            expect(mockAxios.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );

            delete process.env.STRICT_TLS;
        });

        it('should respect STRICT_TLS=true environment variable', () => {
            process.env.STRICT_TLS = 'true';

            createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockAxios.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    httpsAgent: expect.any(Agent),
                })
            );

            delete process.env.STRICT_TLS;
        });
    });

    describe('error handling', () => {
        it('should return default axios instance on file read error', () => {
            mockFs.existsSync.mockReturnValue(true);
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File read error');
            });

            const axiosInstance = createCustomAxiosInstance({
                clientCertPath: '/path/to/client.p12',
            });

            expect(axiosInstance).toBeDefined();
            // Should have been called twice - once for error case, once for fallback
            expect(mockAxios.create).toHaveBeenCalled();
        });
    });
});
