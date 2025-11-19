/* eslint-disable @typescript-eslint/no-explicit-any */

import { FireflyClient, BaseHttpRequest, CancelablePromise } from '@derekprovance/firefly-iii-sdk';
import type { OpenAPIConfig } from '@derekprovance/firefly-iii-sdk';
import type { ApiRequestOptions } from '@derekprovance/firefly-iii-sdk/dist/sdk/core/ApiRequestOptions';
import { createCustomAxiosInstance, CertificateConfig } from '../utils/custom-fetch';
import { request as __request } from '@derekprovance/firefly-iii-sdk/dist/sdk/core/request';
import type { AxiosInstance } from 'axios';

export interface FireflyClientWithCertsConfig extends CertificateConfig {
    BASE: string;
    TOKEN: string;
}

/**
 * Custom HTTP Request implementation that uses a custom axios instance
 * with client certificate support.
 */
class CustomAxiosHttpRequest extends BaseHttpRequest {
    private axiosInstance: AxiosInstance;

    constructor(config: OpenAPIConfig, axiosInstance: AxiosInstance) {
        super(config);
        this.axiosInstance = axiosInstance;
    }

    public override request<T>(options: ApiRequestOptions): CancelablePromise<T> {
        return __request(this.config, options, this.axiosInstance);
    }
}

/**
 * Firefly III SDK Client with Client Certificate Support
 *
 * Extends the standard Firefly III SDK to support client certificate authentication
 * by using a custom axios instance with HTTPS agent support.
 *
 * @example
 * ```typescript
 * const client = new FireflyClientWithCerts({
 *   BASE: 'https://your-firefly-instance.com/api',
 *   TOKEN: 'your-api-token',
 *   caCertPath: '/path/to/ca.pem',
 *   clientCertPath: '/path/to/client.p12',
 *   clientCertPassword: 'password'
 * });
 *
 * // Use the client services
 * const transactions = await client.transactions.listTransaction();
 * ```
 */
export class FireflyClientWithCerts extends FireflyClient {
    constructor(config: FireflyClientWithCertsConfig) {
        // Create custom axios instance with client certificates if provided
        const axiosInstance = config.clientCertPath
            ? createCustomAxiosInstance({
                  caCertPath: config.caCertPath,
                  clientCertPath: config.clientCertPath,
                  clientCertPassword: config.clientCertPassword,
              })
            : undefined;

        super(
            {
                BASE: config.BASE,
                TOKEN: config.TOKEN,
            },
            axiosInstance
                ? (class extends CustomAxiosHttpRequest {
                      constructor(cfg: OpenAPIConfig) {
                          super(cfg, axiosInstance!);
                      }
                  } as any)
                : undefined
        );
    }
}
