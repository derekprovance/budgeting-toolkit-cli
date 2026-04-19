/**
 * Certificate Diagnostic Tool
 * Validates certificate configuration and identifies common issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { CertificateValidator } from './src/utils/certificate-validator.js';
import { createCustomAxiosInstance } from './src/utils/custom-fetch.js';
import axios from 'axios';

const validator = new CertificateValidator();

// Load environment variables
const dotenv = await import('dotenv');
dotenv.config();

const CERT_PATH = process.env.CLIENT_CERT_PATH;
const CERT_PASSWORD = process.env.CLIENT_CERT_PASSWORD;
const CA_PATH = process.env.CLIENT_CERT_CA_PATH;
const API_URL = process.env.FIREFLY_API_URL;
const API_TOKEN = process.env.FIREFLY_API_TOKEN;

console.log('\n📋 Certificate Diagnostic Report\n');
console.log('================================\n');

// 1. Check environment variables
console.log('1️⃣ Configuration Check:');
console.log(`   CLIENT_CERT_PATH: ${CERT_PATH ? '✅ Set' : '❌ Not set'} (${CERT_PATH || 'N/A'})`);
console.log(`   CLIENT_CERT_PASSWORD: ${CERT_PASSWORD ? '✅ Set' : '⚠️  Not set'}`);
console.log(`   CLIENT_CERT_CA_PATH: ${CA_PATH ? '✅ Set' : 'ℹ️  Not set (optional)'} (${CA_PATH || 'N/A'})`);
console.log(`   FIREFLY_API_URL: ${API_URL ? '✅ Set' : '❌ Not set'}`);
console.log(`   FIREFLY_API_TOKEN: ${API_TOKEN ? '✅ Set' : '❌ Not set'}`);

if (!CERT_PATH) {
    console.log('\n❌ No certificate path configured.');
    process.exit(1);
}

console.log('\n2️⃣ File Existence Check:');
const certPath = path.resolve(CERT_PATH);
const fileExists = fs.existsSync(certPath);
console.log(`   Certificate file: ${fileExists ? '✅ Found' : '❌ Not found'} (${certPath})`);

if (fileExists) {
    const stats = fs.statSync(certPath);
    console.log(`   File size: ${stats.size} bytes`);
    console.log(`   Readable: ${(stats.mode & fs.constants.R_OK) ? '✅ Yes' : '❌ No'}`);
    console.log(`   Modified: ${stats.mtime.toISOString()}`);
}

if (CA_PATH) {
    const caPath = path.resolve(CA_PATH);
    const caExists = fs.existsSync(caPath);
    console.log(`   CA certificate: ${caExists ? '✅ Found' : '❌ Not found'} (${caPath})`);
}

// 3. Validate certificate
console.log('\n3️⃣ Certificate Validation:');
const validationResult = validator.validateCertificate(certPath, 'client');

if (validationResult.errors.length === 0) {
    console.log('   ✅ No errors detected');
} else {
    console.log('   ❌ Errors found:');
    validationResult.errors.forEach((error) => {
        console.log(`      • ${error.split('\n').join('\n        ')}`);
    });
}

if (validationResult.warnings.length > 0) {
    console.log('   ⚠️  Warnings:');
    validationResult.warnings.forEach((warning) => {
        console.log(`      • ${warning.split('\n').join('\n        ')}`);
    });
}

// 4. Test certificate loading
console.log('\n4️⃣ Certificate Loading Test:');
try {
    if (CERT_PATH.endsWith('.p12') || CERT_PATH.endsWith('.pfx')) {
        const buffer = fs.readFileSync(certPath);
        console.log(`   ✅ P12 file loaded successfully (${buffer.length} bytes)`);

        // Try to load with password
        try {
            if (CERT_PASSWORD) {
                // We can't directly test the password without Node's native module,
                // but we can at least verify the file reads and starts with proper PKCS#12 header
                if (buffer[0] === 0x30) {
                    console.log('   ✅ P12 file has valid PKCS#12 header');
                } else {
                    console.log('   ❌ P12 file does not have valid PKCS#12 header');
                }
            } else {
                console.log('   ⚠️  No password provided for P12 file');
            }
        } catch (e) {
            console.log(`   ❌ Error processing P12: ${(e as Error).message}`);
        }
    } else {
        const content = fs.readFileSync(certPath, 'utf-8');
        if (content.includes('-----BEGIN')) {
            console.log('   ✅ PEM file loaded successfully');
        } else {
            console.log('   ❌ PEM file does not have valid header');
        }
    }
} catch (error) {
    console.log(`   ❌ Failed to load certificate: ${(error as Error).message}`);
}

// 5. Test axios instance creation
console.log('\n5️⃣ Axios Instance Creation Test:');
try {
    const axiosInstance = createCustomAxiosInstance({
        caCertPath: CA_PATH,
        clientCertPath: CERT_PATH,
        clientCertPassword: CERT_PASSWORD,
    });
    console.log('   ✅ Successfully created axios instance with certificate support');
} catch (error) {
    console.log(`   ❌ Failed to create axios instance: ${(error as Error).message}`);
}

// 6. Test connectivity (if API credentials available)
if (API_URL && API_TOKEN) {
    console.log('\n6️⃣ API Connectivity Test:');
    try {
        const testAxios = createCustomAxiosInstance({
            caCertPath: CA_PATH,
            clientCertPath: CERT_PATH,
            clientCertPassword: CERT_PASSWORD,
        });

        const response = await testAxios.get(`${API_URL}/v1/about`, {
            headers: {
                Authorization: `Bearer ${API_TOKEN}`,
            },
            timeout: 5000,
        });

        if (response.status === 200) {
            console.log('   ✅ Successfully connected to Firefly III API');
            console.log(`   API Version: ${response.data.version || 'Unknown'}`);
        }
    } catch (error) {
        const err = error as any;
        if (err.response?.status === 401) {
            console.log('   ❌ Authentication failed (401): Check FIREFLY_API_TOKEN');
        } else if (err.response?.status === 403) {
            console.log('   ❌ Authorization failed (403): Token may not have required permissions');
        } else if (err.code === 'CERT_HAS_EXPIRED') {
            console.log('   ❌ Certificate has expired');
        } else if (err.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            console.log('   ❌ Certificate hostname mismatch');
        } else if (err.code === 'ECONNREFUSED') {
            console.log(`   ❌ Connection refused: Check API_URL (${API_URL})`);
        } else {
            console.log(`   ❌ Connection error: ${err.message || JSON.stringify(err)}`);
        }
    }
} else {
    console.log('\n6️⃣ API Connectivity Test:');
    console.log('   ⏭️  Skipped (API credentials not fully configured)');
}

console.log('\n================================\n');
console.log('✅ Diagnostic complete!\n');
