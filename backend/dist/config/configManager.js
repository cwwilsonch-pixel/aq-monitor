import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger.js';
let config = null;
export function loadConfig() {
    const configPath = path.join(process.cwd(), 'config', 'config.json');
    if (!fs.existsSync(configPath)) {
        logger.error({ configPath }, 'Config file not found');
        throw new Error('Config file not found');
    }
    const configData = fs.readFileSync(configPath, 'utf-8');
    config = JSON.parse(configData);
    // Override email settings from environment variables if present
    if (config.notifications?.email) {
        const emailConfig = config.notifications.email;
        if (process.env.EMAIL_ENABLED !== undefined) {
            emailConfig.enabled = process.env.EMAIL_ENABLED === 'true';
        }
        if (process.env.EMAIL_SMTP_HOST) {
            emailConfig.smtp.host = process.env.EMAIL_SMTP_HOST;
        }
        if (process.env.EMAIL_SMTP_PORT) {
            emailConfig.smtp.port = parseInt(process.env.EMAIL_SMTP_PORT);
        }
        if (process.env.EMAIL_SMTP_SECURE !== undefined) {
            emailConfig.smtp.secure = process.env.EMAIL_SMTP_SECURE === 'true';
        }
        if (process.env.EMAIL_SMTP_USER) {
            emailConfig.smtp.user = process.env.EMAIL_SMTP_USER;
        }
        if (process.env.EMAIL_SMTP_PASSWORD) {
            emailConfig.smtp.password = process.env.EMAIL_SMTP_PASSWORD;
        }
        if (process.env.EMAIL_FROM) {
            emailConfig.from = process.env.EMAIL_FROM;
        }
        if (process.env.EMAIL_RECIPIENTS) {
            emailConfig.recipients = process.env.EMAIL_RECIPIENTS.split(',').map(e => e.trim());
        }
        if (process.env.EMAIL_ALERT_COOLDOWN_MINUTES) {
            emailConfig.alertCooldownMinutes = parseInt(process.env.EMAIL_ALERT_COOLDOWN_MINUTES);
        }
    }
    logger.info({ databases: config.databases.length }, 'Config loaded');
    return config;
}
export function getConfig() {
    if (!config) {
        return loadConfig();
    }
    return config;
}
