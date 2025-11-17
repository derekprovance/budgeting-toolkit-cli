import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { FireflyClient, OpenAPI } from '@derekprovance/firefly-iii-sdk';
import { CertificateManager, CertificateConfig } from './certificate-manager';

export interface FireflyClientWithCertsConfig extends CertificateConfig {
    baseUrl: string;
    apiToken: string;
    timeout?: number;
}

/**
 * Firefly III SDK Client with Client Certificate Support
 *
 * Extends the standard Firefly III SDK to support client certificate authentication.
 * Uses axios with custom HTTPS agent for certificate handling.
 *
 * @example
 * ```typescript
 * const client = new FireflyClientWithCerts({
 *   baseUrl: 'https://your-firefly-instance.com/api/v1',
 *   apiToken: 'your-api-token',
 *   caCertPath: '/path/to/ca.pem',
 *   clientCertPath: '/path/to/client.p12',
 *   clientCertPassword: 'password'
 * });
 *
 * // Use the client services
 * const transactions = await client.transactions.listTransaction({ limit: 10 });
 * ```
 */
export class FireflyClientWithCerts extends FireflyClient {
    private axiosInstance: AxiosInstance;

    constructor(config: FireflyClientWithCertsConfig) {
        // Initialize the base FireflyClient
        super({
            baseUrl: config.baseUrl,
            apiToken: config.apiToken,
        });

        // Create certificate manager
        const certManager = new CertificateManager(config);
        const httpsAgent = certManager.createHttpsAgent();

        // Create axios instance with certificate support
        this.axiosInstance = axios.create({
            baseURL: config.baseUrl,
            httpsAgent,
            timeout: config.timeout || 30000,
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        });

        // Override the OpenAPI request handler to use our axios instance
        this.overrideRequestHandler();
    }

    /**
     * Overrides the OpenAPI request function to use axios with certificates
     * instead of the default fetch() API
     */
    private overrideRequestHandler(): void {
        // Store reference to axios instance for use in the override
        const axiosInstance = this.axiosInstance;

        // Override the OpenAPI.REQUEST function
        // @ts-expect-error - We're overriding an internal implementation detail
        OpenAPI.REQUEST = async (options: {
            method: string;
            url: string;
            headers?: Record<string, string>;
            body?: unknown;
            query?: Record<string, unknown>;
        }): Promise<unknown> => {
            const axiosConfig: AxiosRequestConfig = {
                method: options.method,
                url: options.url,
                headers: options.headers || {},
                data: options.body,
                params: options.query,
            };

            try {
                const response = await axiosInstance.request(axiosConfig);
                return response.data;
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    // Transform axios error to match expected format
                    throw {
                        status: error.response?.status,
                        statusText: error.response?.statusText,
                        body: error.response?.data,
                        url: options.url,
                    };
                }
                throw error;
            }
        };
    }
}
