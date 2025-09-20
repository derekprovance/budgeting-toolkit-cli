import path from 'path';
import dotenv from 'dotenv';
import { ApiClientConfig } from '@derekprovance/firefly-iii-sdk';
import { getConfigValue } from './utils/config-loader';

dotenv.config({
    quiet: true,
});

export const baseUrl: string = process.env.FIREFLY_API_URL || '';

export const config: ApiClientConfig = {
    baseUrl:
        (process.env.FIREFLY_API_URL?.trim() || 'https://your-firefly-instance.com') + '/api/v1/',
    apiToken: process.env.FIREFLY_API_TOKEN || '',
    caCertPath: process.env.CLIENT_CERT_CA_PATH
        ? path.resolve(__dirname, process.env.CLIENT_CERT_CA_PATH)
        : undefined,
    clientCertPath: process.env.CLIENT_CERT_PATH
        ? path.resolve(__dirname, process.env.CLIENT_CERT_PATH)
        : undefined,
    clientCertPassword: process.env.CLIENT_CERT_PASSWORD,
    rejectUnauthorized: false,
};

export const logLevel: string = process.env.LOG_LEVEL || 'silent';

export const claudeAPIKey = process.env.ANTHROPIC_API_KEY;

export const expectedMonthlyPaycheck = getConfigValue<number>(
    'expectedMonthlyPaycheck',
    'EXPECTED_MONTHLY_PAYCHECK'
);

//TODO(DEREK) - this needs to be migrated to the yaml configuration
export enum Account {
    PRIMARY = '1',
    DISPOSABLE = '13',
    SAVINGS = '2',
    MONEY_MARKET = '27',
    CHASE_AMAZON = '8',
    CHASE_SAPPHIRE = '11',
    CITIBANK_DOUBLECASH = '14',
}

//TODO(DEREK) - this needs to be migrated to the yaml configuration
export enum ExpenseAccount {
    NO_NAME = '5',
}

//TODO(DEREK) - this needs to be migrated to the yaml configuration
export enum Tag {
    DISPOSABLE_INCOME = 'Disposable Income',
    BILLS = 'Bills',
}

//TODO(DEREK) - this needs to be migrated to the yaml configuration
export enum Description {
    PAYROLL = 'PAYROLL',
}
