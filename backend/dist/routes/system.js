import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getConfig } from '../config/configManager.js';
const router = express.Router();
router.get('/info', authenticateToken, (req, res) => {
    const cfg = getConfig();
    const dbId = req.query.dbId;
    let db;
    if (dbId && dbId !== 'all') {
        db = cfg.databases.find(d => d.id === dbId);
        if (!db) {
            return res.status(404).json({ error: `Database '${dbId}' not found` });
        }
    }
    else {
        db = cfg.databases[0];
    }
    if (!db) {
        return res.status(404).json({ error: 'No database configured' });
    }
    // Extract database name from connect string
    // Format: (DESCRIPTION=...SERVICE_NAME=dbname_srv...))
    const match = db.connectString.match(/SERVICE_NAME=([^)]+)\)/i);
    const serviceName = match ? match[1] : 'Unknown';
    // Get just the DB name (before _srv or first dot)
    const dbName = serviceName.split('_')[0].split('.')[0].toUpperCase();
    // Determine environment based on first letter
    let environment = 'UNKNOWN';
    let color = 'gray';
    const firstChar = dbName.charAt(0);
    if (firstChar === 'D') {
        environment = 'DEV';
        color = 'green';
    }
    else if (firstChar === 'T') {
        environment = 'TEST';
        color = 'yellow';
    }
    else if (firstChar === 'P') {
        environment = 'PROD';
        color = 'red';
    }
    res.json({
        dbName,
        environment,
        color,
        user: db.user
    });
});
router.get('/system-users', (req, res) => {
    const cfg = getConfig();
    const systemUsers = cfg.queueDiscovery?.includeSystemUsers || [];
    res.json({ systemUsers });
});
router.get('/databases', (req, res) => {
    const cfg = getConfig();
    const databases = cfg.databases.map(db => ({
        id: db.id,
        user: db.user,
        connectString: db.connectString
    }));
    res.json({ databases });
});
export default router;
