import { FireflyClient, BaseHttpRequest, CancelablePromise } from '@derekprovance/firefly-iii-sdk';
import type { OpenAPIConfig } from '@derekprovance/firefly-iii-sdk';
import type { ApiRequestOptions } from '@derekprovance/firefly-iii-sdk/dist/sdk/core/ApiRequestOptions.js';
import { createCertificateAxios } from '../utils/certificate-axios.utils.js';
import { CertificateConfig } from '../config/config.types.js';
import { request as __request } from '@derekprovance/firefly-iii-sdk/dist/sdk/core/request.js';
import type { AxiosInstance } from 'axios';

export interface FireflyClientWithCertsConfig {
    BASE: string;
    TOKEN: string;
    certificates?: CertificateConfig;
}

/**
 * Factory function type for creating custom axios instances
 */
export type CertificateAxiosFactory = (config: CertificateConfig) => AxiosInstance;

/** What FireflyClient accepts as its request class (the SDK does not export the type) */
type HttpRequestConstructor = ConstructorParameters<typeof FireflyClient>[1];

/**
 * Custom HTTP Request implementation that uses a custom axios instance
 * with client certificate support.
 */
class CustomAxiosHttpRequest extends BaseHttpRequest {
    constructor(
        config: OpenAPIConfig,
        private readonly axiosInstance: AxiosInstance
    ) {
        super(config);
    }

    public override request<T>(options: ApiRequestOptions): CancelablePromise<T> {
        // axios ships distinct ESM/CJS type identities; the CJS-built SDK expects
        // the CJS AxiosInstance, so bridge via the SDK function's own parameter type
        return __request(
            this.config,
            options,
            this.axiosInstance as unknown as Parameters<typeof __request>[2]
        );
    }
}

/** A request class the SDK can construct from its config alone, bound to axiosInstance */
function requestClassFor(axiosInstance: AxiosInstance): HttpRequestConstructor {
    return class extends CustomAxiosHttpRequest {
        constructor(config: OpenAPIConfig) {
            super(config, axiosInstance);
        }
    };
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
 *   certificates: {
 *     caCertPath: '/path/to/ca.pem',
 *     clientCertPath: '/path/to/client.p12',
 *     clientCertPassword: 'password',
 *   },
 * });
 *
 * // Use the client services
 * const transactions = await client.transactions.listTransaction();
 * ```
 */
export class FireflyClientWithCerts extends FireflyClient {
    constructor(
        { BASE, TOKEN, certificates }: FireflyClientWithCertsConfig,
        certificateAxiosFactory: CertificateAxiosFactory = createCertificateAxios
    ) {
        // A custom agent is needed when any certificate (client or CA) is configured
        super(
            { BASE, TOKEN },
            certificates?.clientCertPath || certificates?.caCertPath
                ? requestClassFor(certificateAxiosFactory(certificates))
                : undefined
        );
    }
}
