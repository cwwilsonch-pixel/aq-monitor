import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/configManager.js';

interface EmailAlert {
  queueName: string;
  messageCount: number;
  lastDequeued: string | null;
  environment: string;
  database: string;
  dbId: string;
}

// Track last alert time for each queue (cooldown mechanism)
const lastAlertTime: Map<string, number> = new Map();

// Runtime email toggle state per database (does not persist across restarts)
const runtimeEmailEnabledPerDb: Map<string, boolean> = new Map();

/**
 * Check if email is enabled for a specific database
 */
export function isEmailEnabledForDb(dbId?: string): boolean {
  const config = getConfig();
  
  // If dbId provided, check runtime override first, then config
  if (dbId) {
    if (runtimeEmailEnabledPerDb.has(dbId)) {
      return runtimeEmailEnabledPerDb.get(dbId)!;
    }
    
    // Check config for this database
    const dbConfig = config.databases.find(db => db.id === dbId);
    if (dbConfig && dbConfig.emailEnabled !== undefined) {
      return dbConfig.emailEnabled;
    }
  }
  
  // Fall back to environment check
  return isEmailEnabledForEnvironment();
}

/**
 * Set runtime email enabled state for a specific database
 */
export function setEmailEnabled(enabled: boolean, dbId?: string): void {
  if (dbId) {
    runtimeEmailEnabledPerDb.set(dbId, enabled);
    logger.info({ dbId, enabled }, `Email notifications ${enabled ? 'ENABLED' : 'DISABLED'} at runtime for database`);
  } else {
    // Set for all databases
    const config = getConfig();
    config.databases.forEach(db => {
      runtimeEmailEnabledPerDb.set(db.id, enabled);
    });
    logger.info({ enabled }, `Email notifications ${enabled ? 'ENABLED' : 'DISABLED'} at runtime for ALL databases`);
  }
}

/**
 * Get email status info for a specific database
 */
export function getEmailStatus(dbId?: string) {
  const config = getConfig();
  const configEnabled = isEmailEnabledForEnvironment();
  
  if (dbId) {
    const dbConfig = config.databases.find(db => db.id === dbId);
    const dbConfigEnabled = dbConfig?.emailEnabled ?? true;
    const hasOverride = runtimeEmailEnabledPerDb.has(dbId);
    const actuallyEnabled = isEmailEnabledForDb(dbId);
    
    return {
      enabled: actuallyEnabled,
      configEnabled: dbConfigEnabled,
      hasOverride,
      dbId,
      environment: process.env.NODE_ENV || 'development'
    };
  }
  
  // Global status - all databases
  return {
    enabled: configEnabled,
    configEnabled,
    hasOverride: false,
    environment: process.env.NODE_ENV || 'development'
  };
}

/**
 * Gets email transporter from config
 */
function getEmailTransporter() {
  const config = getConfig() as any;
  const emailConfig = config.notifications?.email;
  
  if (!emailConfig || !emailConfig.enabled) {
    return null;
  }

  // Override with environment variables if present
  const smtpHost = process.env.EMAIL_SMTP_HOST || emailConfig.smtp.host;
  const smtpPort = parseInt(process.env.EMAIL_SMTP_PORT || emailConfig.smtp.port);
  const smtpSecure = process.env.EMAIL_SMTP_SECURE === 'true' || emailConfig.smtp.secure;
  const smtpUser = process.env.EMAIL_SMTP_USER || emailConfig.smtp?.user;
  const smtpPassword = process.env.EMAIL_SMTP_PASSWORD || emailConfig.smtp?.password;
  const rejectUnauthorized = process.env.EMAIL_SMTP_REJECT_UNAUTHORIZED !== 'false'; // Default true

  // Check if we have valid credentials (not empty strings or placeholders)
  const hasValidAuth = smtpUser && smtpPassword && 
                       smtpUser !== 'SET_IN_ENV' && 
                       smtpPassword !== 'SET_IN_ENV' &&
                       smtpUser.trim() !== '' &&
                       smtpPassword.trim() !== '';

  logger.info({ 
    host: smtpHost, 
    port: smtpPort, 
    secure: smtpSecure,
    rejectUnauthorized,
    hasAuth: hasValidAuth,
    userProvided: !!smtpUser,
    passwordProvided: !!smtpPassword
  }, 'Creating email transporter');

  const transportConfig: any = {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    tls: {
      rejectUnauthorized: rejectUnauthorized
    }
  };

  // Only add auth if valid credentials provided
  if (hasValidAuth) {
    transportConfig.auth = {
      user: smtpUser,
      pass: smtpPassword
    };
  }

  return nodemailer.createTransport(transportConfig);
}

/**
 * Checks if email notifications are enabled for current environment
 */
function isEmailEnabledForEnvironment(): boolean {
  const config = getConfig() as any;
  const emailConfig = config.notifications?.email;
  
  if (!emailConfig || !emailConfig.enabled) {
    return false;
  }

  // Check environment variable override
  if (process.env.EMAIL_ENABLED === 'false') {
    return false;
  }

  // Check if current environment is in enabled list
  const currentEnv = process.env.NODE_ENV || 'development';
  const enabledEnvironments = emailConfig.enabledEnvironments || ['production'];
  
  return enabledEnvironments.includes(currentEnv);
}

/**
 * Checks if enough time has passed since last alert for this queue (cooldown)
 */
function canSendAlert(queueName: string): boolean {
  if (!isEmailEnabledForEnvironment()) {
    return false;
  }
  
  const config = getConfig() as any;
  const cooldownMinutes = config.notifications?.email?.alertCooldownMinutes || 30;
  const cooldownMs = cooldownMinutes * 60 * 1000;
  
  const lastAlert = lastAlertTime.get(queueName);
  if (!lastAlert) {
    return true;
  }
  
  return (Date.now() - lastAlert) > cooldownMs;
}

/**
 * Formats the time ago string
 */
function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) {
    return 'Never';
  }
  
  const date = new Date(dateStr);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Sends email alert for blocked queue
 */
export async function sendBlockedQueueAlert(alert: EmailAlert): Promise<boolean> {
  try {
    // Check if email is enabled for this database
    if (!isEmailEnabledForDb(alert.dbId)) {
      logger.debug({ queueName: alert.queueName, dbId: alert.dbId }, 'Email alerts disabled for this database');
      return false;
    }

    // Check cooldown
    if (!canSendAlert(alert.queueName)) {
      logger.debug({ queueName: alert.queueName }, 'Alert cooldown in effect, skipping email');
      return false;
    }

    const transporter = getEmailTransporter();
    if (!transporter) {
      logger.warn('Email transporter not configured');
      return false;
    }

    const config = getConfig() as any;
    const emailConfig = config.notifications?.email;
    
    const fromAddress = process.env.EMAIL_FROM || emailConfig.from;
    const recipientsEnv = process.env.EMAIL_RECIPIENTS;
    const recipients = recipientsEnv 
      ? recipientsEnv.split(',').map(e => e.trim())
      : emailConfig.recipients;

    if (!recipients || recipients.length === 0) {
      logger.warn('No email recipients configured');
      return false;
    }

    const subject = `🔴 Queue Alert: ${alert.queueName} is BLOCKED`;
    
    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; font-size: 24px;">🔴 Queue Alert: BLOCKED</h1>
            </div>
            
            <div style="background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
              <h2 style="color: #dc2626; margin-top: 0;">Queue Status</h2>
              
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr style="background: white;">
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Database</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">${alert.database}</td>
                </tr>
                <tr style="background: white;">
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Environment</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb;">${alert.environment.toUpperCase()}</td>
                </tr>
                <tr style="background: white;">
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Queue Name</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb;">${alert.queueName}</td>
                </tr>
                <tr style="background: #fee2e2;">
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Messages Ready</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb; color: #dc2626; font-weight: bold;">${alert.messageCount.toLocaleString()}</td>
                </tr>
                <tr style="background: white;">
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Last Dequeued</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb;">${formatTimeAgo(alert.lastDequeued)}</td>
                </tr>
                <tr style="background: white;">
                  <td style="padding: 12px; border: 1px solid #e5e7eb; font-weight: bold;">Timestamp</td>
                  <td style="padding: 12px; border: 1px solid #e5e7eb;">${new Date().toLocaleString()}</td>
                </tr>
              </table>
              
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; margin: 20px 0;">
                <strong>⚠️ Action Required:</strong><br>
                This queue has messages ready but has not been processed recently. Please investigate immediately.
              </div>
              
              <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
                This is an automated alert from AQ Monitor. You are receiving this because the queue has been blocked for more than 5 minutes.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const textBody = `
Queue Alert: ${alert.queueName} is BLOCKED

Database: ${alert.database}
Environment: ${alert.environment.toUpperCase()}
Queue Name: ${alert.queueName}
Messages Ready: ${alert.messageCount.toLocaleString()}
Last Dequeued: ${formatTimeAgo(alert.lastDequeued)}
Timestamp: ${new Date().toLocaleString()}

This queue has messages ready but has not been processed recently. Please investigate immediately.

This is an automated alert from AQ Monitor.
    `;

    await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(', '),
      subject: subject,
      text: textBody,
      html: htmlBody
    });

    // Update last alert time
    lastAlertTime.set(alert.queueName, Date.now());

    logger.info({ queueName: alert.queueName, recipients: recipients.length }, 'Blocked queue alert email sent');
    return true;

  } catch (err: any) {
    logger.error({ 
      err: err.message, 
      code: err.code,
      command: err.command,
      responseCode: err.responseCode,
      queueName: alert.queueName,
      smtpHost: process.env.EMAIL_SMTP_HOST,
      smtpPort: process.env.EMAIL_SMTP_PORT,
      smtpSecure: process.env.EMAIL_SMTP_SECURE
    }, 'Failed to send email alert');
    return false;
  }
}

/**
 * Test email configuration
 */
export async function sendTestEmail(recipient: string): Promise<boolean> {
  if (!isEmailEnabledForEnvironment()) {
    throw new Error('Email is not enabled for this environment');
  }

  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      throw new Error('Email transporter not configured');
    }

    const config = getConfig() as any;
    const emailConfig = config.notifications?.email;
    const fromAddress = process.env.EMAIL_FROM || emailConfig.from;

    await transporter.sendMail({
      from: fromAddress,
      to: recipient,
      subject: 'AQ Monitor - Test Email',
      text: 'This is a test email from AQ Monitor. Email notifications are working correctly.',
      html: '<p>This is a test email from AQ Monitor. Email notifications are working correctly.</p>'
    });

    logger.info({ recipient }, 'Test email sent successfully');
    return true;

  } catch (err: any) {
    logger.error({ 
      err: err.message,
      code: err.code,
      command: err.command,
      responseCode: err.responseCode,
      smtpHost: process.env.EMAIL_SMTP_HOST,
      smtpPort: process.env.EMAIL_SMTP_PORT,
      smtpSecure: process.env.EMAIL_SMTP_SECURE
    }, 'Failed to send test email');
    return false;
  }
}
