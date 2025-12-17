import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';
import { configSchema } from './schema.js';
import { logger } from '../utils/logger.js';
let cached = null;
export function loadConfig() {
    if (cached)
        return cached;
    const file = path.resolve(process.cwd(), 'config', 'config.json');
    if (!fs.existsSync(file)) {
        throw new Error(`Config file not found at ${file}. Please copy config.example.json to config.json`);
    }
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw);
    // Override sensitive credentials from environment variables
    function resolveEnvPlaceholders(value) {
        const match = value.match(/^\$\{(.+)\}$/);
        if (match) {
            const envVar = match[1];
            return process.env[envVar] || value;
        }
        return value;
    }
    if (data.databases && Array.isArray(data.databases)) {
        data.databases = data.databases.map((db) => {
            return {
                ...db,
                user: typeof db.user === 'string' ? resolveEnvPlaceholders(db.user) : db.user,
                password: typeof db.password === 'string' ? resolveEnvPlaceholders(db.password) : db.password,
            };
        });
    }
    // Override LDAP credentials from environment variables
    if (data.auth?.ldap) {
        const ldapBindDN = process.env.LDAP_BIND_DN;
        const ldapBindPassword = process.env.LDAP_BIND_PASSWORD;
        if (ldapBindDN)
            data.auth.ldap.bindDN = ldapBindDN;
        if (ldapBindPassword)
            data.auth.ldap.bindPassword = ldapBindPassword;
    }
    const ajv = new Ajv({ allErrors: true });
    const validate = ajv.compile(configSchema);
    if (!validate(data)) {
        logger.error(validate.errors);
        throw new Error('Invalid config.json');
    }
    cached = data;
    return cached;
}
export function clearConfigCache() {
    cached = null;
}
