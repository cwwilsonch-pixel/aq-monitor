# Email Notifications Setup Guide

This guide explains how to configure email notifications for blocked queue alerts in AQ Monitor.

## Overview

AQ Monitor can automatically send email alerts when a queue is **BLOCKED** (has messages but hasn't been processed for more than 5 minutes).

## Features

✅ **Environment-based control** - Enable/disable emails per environment (dev/test/prod)  
✅ **Smart cooldown** - Prevents alert spam (default: 30 minutes between alerts per queue)  
✅ **Rich HTML emails** - Professional formatted alerts with queue details  
✅ **Multiple recipients** - Send to multiple email addresses  
✅ **Test endpoint** - Verify email configuration before going live  

## Configuration

### 1. Environment Variables (.env)

Add to `backend/.env`:

```env
# Email Notifications
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp.office365.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-email@company.com
EMAIL_SMTP_PASSWORD=your-email-password
EMAIL_FROM=aq-monitor@company.com
EMAIL_RECIPIENTS=admin1@company.com,admin2@company.com,team@company.com
EMAIL_ALERT_COOLDOWN_MINUTES=30
```

### 2. Config File (config.json)

The `config.json` includes email configuration:

```json
{
  "notifications": {
    "email": {
      "enabled": false,
      "smtp": {
        "host": "SET_IN_ENV",
        "port": 587,
        "secure": false,
        "user": "SET_IN_ENV",
        "password": "SET_IN_ENV"
      },
      "from": "SET_IN_ENV",
      "recipients": [],
      "alertCooldownMinutes": 30,
      "enabledEnvironments": ["production"]
    }
  }
}
```

**Important**: Environment variables override config.json values.

## Environment Control

### Enable for Specific Environments

Edit `config.json`:

```json
"enabledEnvironments": ["production"]          // Only production
"enabledEnvironments": ["test", "production"]  // Test and production
"enabledEnvironments": ["development", "test", "production"]  // All environments
```

Set your environment:
```env
NODE_ENV=production   # or development, test
```

### Quick Enable/Disable

```env
EMAIL_ENABLED=false   # Temporarily disable all emails
EMAIL_ENABLED=true    # Enable emails (respects enabledEnvironments)
```

## SMTP Configuration

### Office 365 / Outlook

```env
EMAIL_SMTP_HOST=smtp.office365.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-email@company.com
EMAIL_SMTP_PASSWORD=your-password
```

### Gmail

```env
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=your-app-password  # Use App Password, not regular password
```

### Other SMTP Servers

```env
EMAIL_SMTP_HOST=mail.your-company.com
EMAIL_SMTP_PORT=25    # or 465 for SSL, 587 for TLS
EMAIL_SMTP_SECURE=false   # true for port 465
EMAIL_SMTP_USER=smtp-user
EMAIL_SMTP_PASSWORD=smtp-password
```

## Testing Email Configuration

### Using API Endpoint

```powershell
# Get auth token first
$token = "your-jwt-token"

# Send test email
$headers = @{ Authorization = "Bearer $token" }
$body = @{ recipient = "your-email@company.com" } | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:4001/aq-monitor/api/admin/test-email" `
  -Method POST `
  -Headers $headers `
  -Body $body `
  -ContentType "application/json"
```

### Using curl

```bash
curl -X POST http://localhost:4001/aq-monitor/api/admin/test-email \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"recipient":"your-email@company.com"}'
```

## Alert Behavior

### When Alerts Are Sent

An email alert is sent when **ALL** of these conditions are met:

1. ✅ Email is enabled (`EMAIL_ENABLED=true`)
2. ✅ Current environment is in `enabledEnvironments` list
3. ✅ Queue has messages ready (`message_count > 0`)
4. ✅ Queue hasn't been processed for > 5 minutes
5. ✅ Cooldown period has passed (default: 30 minutes since last alert for this queue)

### Alert Cooldown

Prevents alert spam. Default: **30 minutes**

```env
EMAIL_ALERT_COOLDOWN_MINUTES=30   # 30 minutes
EMAIL_ALERT_COOLDOWN_MINUTES=60   # 1 hour
EMAIL_ALERT_COOLDOWN_MINUTES=5    # 5 minutes (testing)
```

The cooldown is **per queue**. If Queue A sends an alert, Queue B can still send its alert immediately.

## Email Content

### Subject Line
```
🔴 Queue Alert: SUNRISE.X_SAP_Q_IN_MSG is BLOCKED
```

### Email Body Includes

- Queue name
- Number of ready messages
- Last dequeued timestamp (or "Never")
- Environment (DEV/TEST/PROD)
- Timestamp of alert
- Action required message

## Troubleshooting

### No Emails Being Sent

1. **Check environment**:
   ```powershell
   $env:NODE_ENV
   ```
   Ensure it matches `enabledEnvironments` in config

2. **Check if enabled**:
   ```powershell
   $env:EMAIL_ENABLED
   ```
   Should be `true` or not set

3. **Check logs**:
   Look for:
   - `Email alerts disabled for this environment`
   - `Alert cooldown in effect, skipping email`
   - `Blocked queue alert email sent`

4. **Verify SMTP settings**:
   Test with the `/api/admin/test-email` endpoint

### Authentication Errors

**Office 365**:
- Enable SMTP AUTH in Microsoft 365 admin center
- Use app password if MFA is enabled

**Gmail**:
- Enable "Less secure app access" OR
- Use App Password (recommended)

### Emails Going to Spam

- Verify `EMAIL_FROM` address is valid
- Check SPF/DKIM records for your domain
- Test with internal email addresses first

## Security Best Practices

⚠️ **Never commit credentials to git**

✅ **DO**:
- Store SMTP password in `.env` file
- Add `.env` to `.gitignore`
- Use app passwords instead of main passwords
- Rotate passwords regularly

❌ **DON'T**:
- Commit `.env` file
- Put passwords in `config.json`
- Use personal email accounts in production
- Share SMTP credentials

## Examples

### Development Setup (Disabled)

```env
NODE_ENV=development
EMAIL_ENABLED=false
```

### Test Environment (Enabled, Single Recipient)

```env
NODE_ENV=test
EMAIL_ENABLED=true
EMAIL_RECIPIENTS=test-admin@company.com
EMAIL_ALERT_COOLDOWN_MINUTES=5  # Short cooldown for testing
```

### Production Setup (Enabled, Multiple Recipients)

```env
NODE_ENV=production
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp.office365.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=aq-monitor@company.com
EMAIL_SMTP_PASSWORD=strong-password-here
EMAIL_FROM=aq-monitor@company.com
EMAIL_RECIPIENTS=dba-team@company.com,ops-team@company.com,alerts@company.com
EMAIL_ALERT_COOLDOWN_MINUTES=30
```

## Monitoring

Check backend logs for email activity:

```
[INFO] Blocked queue alert email sent { queueName: 'SUNRISE.X_SAP_Q_IN_MSG', recipients: 3 }
[DEBUG] Email alerts disabled for this environment { queueName: 'SUNRISE.X_SAP_Q_IN_MSG' }
[DEBUG] Alert cooldown in effect, skipping email { queueName: 'SUNRISE.X_SAP_Q_IN_MSG' }
[ERROR] Failed to send email alert { err: 'SMTP error', queueName: 'SUNRISE.X_SAP_Q_IN_MSG' }
```

## FAQ

**Q: Can I use different recipients per queue?**  
A: Not currently. All blocked queues send to the same recipient list. Consider using email filters/rules.

**Q: Can I customize the email template?**  
A: Yes, edit `backend/src/services/emailService.ts` - the HTML template is in the `sendBlockedQueueAlert` function.

**Q: How often are queues checked?**  
A: Every polling interval (default: 10 seconds). But alerts respect the cooldown period.

**Q: Can I change the 5-minute blocking threshold?**  
A: Yes, edit `blockedThresholdMs` in `backend/src/aq/aqPoller.ts` (currently line ~385).

**Q: Will I get flooded with emails?**  
A: No. The cooldown mechanism (default 30 minutes) prevents spam. Each queue can only send one alert per cooldown period.
