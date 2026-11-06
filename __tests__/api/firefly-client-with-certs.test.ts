import { jest } from '@jest/globals';
import type { AxiosInstance } from 'axios';
import {
    FireflyClientWithCerts,
    CertificateAxiosFactory,
} from '../../src/api/firefly-client-with-certs.js';

describe('FireflyClientWithCerts', () => {
    let mockCertificateAxiosFactory: jest.MockedFunction<CertificateAxiosFactory>;

    beforeEach(() => {
        mockCertificateAxiosFactory = jest
            .fn<CertificateAxiosFactory>()
            .mockReturnValue({} as AxiosInstance);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with BASE and TOKEN', () => {
            const client = new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                },
                mockCertificateAxiosFactory
            );

            expect(client).toBeDefined();
        });

        it('should not call createCertificateAxios when no clientCertPath', () => {
            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).not.toHaveBeenCalled();
        });

        it('should not call createCertificateAxios when clientCertPath is empty', () => {
            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                    certificates: {
                        clientCertPath: '',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).not.toHaveBeenCalled();
        });

        it('should call createCertificateAxios with certificate config when clientCertPath provided', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                    certificates: {
                        clientCertPath: '/path/to/client.p12',
                        caCertPath: '/path/to/ca.pem',
                        clientCertPassword: 'secret',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalledWith({
                caCertPath: '/path/to/ca.pem',
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });
        });

        it('should create custom axios instance when certificates are provided', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                    certificates: {
                        clientCertPath: '/path/to/client.p12',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalled();
        });

        it('should work with only clientCertPath (no CA cert)', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                    certificates: {
                        clientCertPath: '/path/to/client.p12',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalledWith({
                caCertPath: undefined,
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: undefined,
            });
        });

        it('should work with only clientCertPath and password (no CA cert)', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                    certificates: {
                        clientCertPath: '/path/to/client.p12',
                        clientCertPassword: 'secret',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalledWith({
                caCertPath: undefined,
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });
        });
    });

    describe('service inheritance', () => {
        it('should inherit all services from FireflyClient', () => {
            const client = new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                },
                mockCertificateAxiosFactory
            );

            // Verify core services are available
            expect(client.transactions).toBeDefined();
            expect(client.budgets).toBeDefined();
            expect(client.categories).toBeDefined();
            expect(client.accounts).toBeDefined();
            expect(client.tags).toBeDefined();
        });

        it('should have all major SDK services available', () => {
            const client = new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'test-token-123',
                },
                mockCertificateAxiosFactory
            );

            const expectedServices = [
                'transactions',
                'budgets',
                'categories',
                'accounts',
                'tags',
                'bills',
                'about',
                'attachments',
                'autocomplete',
                'availableBudgets',
                'charts',
                'configuration',
                'currencies',
                'data',
                'insight',
                'links',
                'objectGroups',
                'piggyBanks',
                'preferences',
                'recurrences',
                'ruleGroups',
                'rules',
                'search',
                'summary',
                'users',
                'webhooks',
            ];

            expectedServices.forEach(service => {
                expect(client).toHaveProperty(service);
            });
        });
    });

    describe('client creation', () => {
        it('should create client successfully with BASE and TOKEN', () => {
            const client = new FireflyClientWithCerts(
                {
                    BASE: 'https://custom.firefly.com/api',
                    TOKEN: 'token',
                },
                mockCertificateAxiosFactory
            );

            expect(client).toBeDefined();
            expect(client.transactions).toBeDefined();
        });

        it('should create client with different configurations', () => {
            const client1 = new FireflyClientWithCerts(
                {
                    BASE: 'https://first.firefly.com/api',
                    TOKEN: 'first-token',
                },
                mockCertificateAxiosFactory
            );

            const client2 = new FireflyClientWithCerts(
                {
                    BASE: 'https://second.firefly.com/api',
                    TOKEN: 'second-token',
                },
                mockCertificateAxiosFactory
            );

            expect(client1).toBeDefined();
            expect(client2).toBeDefined();
        });
    });

    describe('certificate configuration combinations', () => {
        it('should handle full certificate config', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'token',
                    certificates: {
                        caCertPath: '/ca.pem',
                        clientCertPath: '/client.p12',
                        clientCertPassword: 'pass',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalledWith({
                caCertPath: '/ca.pem',
                clientCertPath: '/client.p12',
                clientCertPassword: 'pass',
            });
        });

        it('should handle certificate config without password', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'token',
                    certificates: {
                        caCertPath: '/ca.pem',
                        clientCertPath: '/client.pem',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalledWith({
                caCertPath: '/ca.pem',
                clientCertPath: '/client.pem',
                clientCertPassword: undefined,
            });
        });

        it('should handle certificate config without CA cert', () => {
            const mockAxiosInstance = {} as AxiosInstance;
            mockCertificateAxiosFactory.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts(
                {
                    BASE: 'https://firefly.example.com/api',
                    TOKEN: 'token',
                    certificates: {
                        clientCertPath: '/client.p12',
                        clientCertPassword: 'pass',
                    },
                },
                mockCertificateAxiosFactory
            );

            expect(mockCertificateAxiosFactory).toHaveBeenCalledWith({
                caCertPath: undefined,
                clientCertPath: '/client.p12',
                clientCertPassword: 'pass',
            });
        });
    });
});
