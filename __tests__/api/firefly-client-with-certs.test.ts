import { FireflyClientWithCerts } from '../../src/api/firefly-client-with-certs';
import { createCustomAxiosInstance } from '../../src/utils/custom-fetch';
import { OpenAPI } from '@derekprovance/firefly-iii-sdk';

jest.mock('../../src/utils/custom-fetch');

describe('FireflyClientWithCerts', () => {
    const mockCreateCustomAxiosInstance = createCustomAxiosInstance as jest.MockedFunction<typeof createCustomAxiosInstance>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with BASE and TOKEN', () => {
            const client = new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
            });

            expect(client).toBeDefined();
        });

        it('should not call createCustomAxiosInstance when no clientCertPath', () => {
            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
            });

            expect(mockCreateCustomAxiosInstance).not.toHaveBeenCalled();
        });

        it('should not call createCustomAxiosInstance when clientCertPath is empty', () => {
            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
                clientCertPath: '',
            });

            expect(mockCreateCustomAxiosInstance).not.toHaveBeenCalled();
        });

        it('should call createCustomAxiosInstance with certificate config when clientCertPath provided', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
                clientCertPath: '/path/to/client.p12',
                caCertPath: '/path/to/ca.pem',
                clientCertPassword: 'secret',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalledWith({
                caCertPath: '/path/to/ca.pem',
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });
        });

        it('should create custom axios instance when certificates are provided', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalled();
        });

        it('should work with only clientCertPath (no CA cert)', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
                clientCertPath: '/path/to/client.p12',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalledWith({
                caCertPath: undefined,
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: undefined,
            });
        });

        it('should work with only clientCertPath and password (no CA cert)', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalledWith({
                caCertPath: undefined,
                clientCertPath: '/path/to/client.p12',
                clientCertPassword: 'secret',
            });
        });
    });

    describe('service inheritance', () => {
        it('should inherit all services from FireflyClient', () => {
            const client = new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
            });

            // Verify core services are available
            expect(client.transactions).toBeDefined();
            expect(client.budgets).toBeDefined();
            expect(client.categories).toBeDefined();
            expect(client.accounts).toBeDefined();
            expect(client.tags).toBeDefined();
        });

        it('should have all major SDK services available', () => {
            const client = new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'test-token-123',
            });

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

            expectedServices.forEach((service) => {
                expect(client).toHaveProperty(service);
            });
        });
    });

    describe('client creation', () => {
        it('should create client successfully with BASE and TOKEN', () => {
            const client = new FireflyClientWithCerts({
                BASE: 'https://custom.firefly.com/api',
                TOKEN: 'token',
            });

            expect(client).toBeDefined();
            expect(client.transactions).toBeDefined();
        });

        it('should create client with different configurations', () => {
            const client1 = new FireflyClientWithCerts({
                BASE: 'https://first.firefly.com/api',
                TOKEN: 'first-token',
            });

            const client2 = new FireflyClientWithCerts({
                BASE: 'https://second.firefly.com/api',
                TOKEN: 'second-token',
            });

            expect(client1).toBeDefined();
            expect(client2).toBeDefined();
        });
    });

    describe('certificate configuration combinations', () => {
        it('should handle full certificate config', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'token',
                caCertPath: '/ca.pem',
                clientCertPath: '/client.p12',
                clientCertPassword: 'pass',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalledWith({
                caCertPath: '/ca.pem',
                clientCertPath: '/client.p12',
                clientCertPassword: 'pass',
            });
        });

        it('should handle certificate config without password', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'token',
                caCertPath: '/ca.pem',
                clientCertPath: '/client.pem',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalledWith({
                caCertPath: '/ca.pem',
                clientCertPath: '/client.pem',
                clientCertPassword: undefined,
            });
        });

        it('should handle certificate config without CA cert', () => {
            const mockAxiosInstance = {} as any;
            mockCreateCustomAxiosInstance.mockReturnValue(mockAxiosInstance);

            new FireflyClientWithCerts({
                BASE: 'https://firefly.example.com/api',
                TOKEN: 'token',
                clientCertPath: '/client.p12',
                clientCertPassword: 'pass',
            });

            expect(mockCreateCustomAxiosInstance).toHaveBeenCalledWith({
                caCertPath: undefined,
                clientCertPath: '/client.p12',
                clientCertPassword: 'pass',
            });
        });
    });
});
