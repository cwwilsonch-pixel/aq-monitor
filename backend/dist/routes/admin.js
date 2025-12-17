import { Router } from 'express';
import { authRequired } from '../auth/authMiddleware.js';
import { loadConfig, clearConfigCache } from '../config/loadConfig.js';
import { discoverAllQueues } from '../services/queueDiscoveryService.js';
import { sendTestEmail, getEmailStatus, setEmailEnabled } from '../services/emailService.js';
import { logger } from '../utils/logger.js';
const r = Router();
r.post('/reload-config', authRequired, async (_req, res) => {
    clearConfigCache();
    const cfg = loadConfig();
    res.json({ message: 'Config reloaded', databases: cfg.databases.length });
});
r.get('/discover-queues', authRequired, async (_req, res) => {
    const cfg = loadConfig();
    const queues = await discoverAllQueues(cfg);
    res.json({ queues, count: queues.length });
});
r.post('/test-email', authRequired, async (req, res) => {
    try {
        const { recipient } = req.body;
        if (!recipient) {
            return res.status(400).json({ error: 'Recipient email is required' });
        }
        const success = await sendTestEmail(recipient);
        if (success) {
            res.json({ message: 'Test email sent successfully', recipient });
        }
        else {
            res.status(500).json({ error: 'Failed to send test email. Check logs for details.' });
        }
    }
    catch (err) {
        logger.error({ err: err.message }, 'Error in test email endpoint');
        res.status(500).json({ error: err.message });
    }
});
/**
 * Get email notification status (no auth required - just status info)
 * Accepts optional dbId query parameter for per-database status
 */
r.get('/email-status', (req, res) => {
    try {
        const dbId = req.query.dbId;
        const status = getEmailStatus(dbId);
        res.json(status);
    }
    catch (error) {
        logger.error({ err: error.message }, 'Failed to get email status');
        res.status(500).json({ error: 'Failed to get email status' });
    }
});
/**
 * Toggle email notifications at runtime (no auth for internal tool)
 * Accepts dbId in body for per-database toggling
 */
r.post('/email-toggle', (req, res) => {
    try {
        const { enabled, dbId } = req.body;
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled must be a boolean' });
        }
        setEmailEnabled(enabled, dbId);
        const status = getEmailStatus(dbId);
        res.json({
            message: `Email notifications ${enabled ? 'enabled' : 'disabled'}${dbId ? ` for ${dbId}` : ''}`,
            status
        });
    }
    catch (error) {
        logger.error({ err: error.message }, 'Failed to toggle email');
        res.status(500).json({ error: 'Failed to toggle email' });
    }
});
export default r;
