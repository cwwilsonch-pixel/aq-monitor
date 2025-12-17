import express from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';
import { authenticateLdap } from '../services/ldapAuthService.js';
import { getConfig } from '../config/configManager.js';
const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
// Simple in-memory user store for local fallback
const users = [
    { username: 'admin', password: 'Darkangel121!' }
];
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const config = getConfig();
        let authenticated = false;
        // Try LDAP authentication first if enabled
        if (config.auth?.ldap?.enabled) {
            try {
                const ldapResult = await authenticateLdap(username, password);
                if (ldapResult.authenticated) {
                    const token = jwt.sign({
                        username,
                        authMethod: 'ldap',
                        groups: ldapResult.groups
                    }, JWT_SECRET, { expiresIn: '24h' });
                    logger.info({ username, authMethod: 'ldap', groups: ldapResult.groups }, 'Login successful');
                    return res.json({ token, groups: ldapResult.groups });
                }
                else if (ldapResult.groups && ldapResult.groups.length > 0) {
                    // User authenticated but not in allowed groups
                    logger.warn({ username, groups: ldapResult.groups }, 'User not authorized - not in allowed groups');
                    return res.status(403).json({ error: 'Access denied - insufficient permissions' });
                }
            }
            catch (error) {
                logger.error({ error, username }, 'LDAP authentication error');
                // Continue to local auth if LDAP fails
            }
        }
        // Fallback to local authentication if enabled
        if (config.auth?.local?.enabled) {
            const user = users.find(u => u.username === username && u.password === password);
            if (user) {
                const token = jwt.sign({ username, authMethod: 'local' }, JWT_SECRET, { expiresIn: '24h' });
                logger.info({ username, authMethod: 'local' }, 'Login successful');
                return res.json({ token });
            }
        }
        // No authentication method succeeded
        logger.warn({ username }, 'Login failed');
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    catch (error) {
        logger.error({ error, username }, 'Login error');
        return res.status(500).json({ error: 'Authentication error' });
    }
});
export default router;
