import fs from 'fs';
import https from 'https';
import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger.js';
dotenv.config();
logger.info(`DB_T1KENCH_PASSWORD value after .env load: ${process.env.DB_T1KENCH_PASSWORD}`);
dotenv.config();
import { loadConfig } from './config/configManager.js';
import { initializeOraclePools } from './aq/oraclePool.js';
import { startPolling } from './aq/aqPoller.js';
import { initDatabase } from './db/snapshotStore.js';

import authRoutes from './routes/auth.js';
import queuesRoutes from './routes/queues.js';
import analyticsRoutes from './routes/analytics.js';
import systemRoutes from './routes/system.js';
import adminRoutes from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4001;
const BASE_PATH = process.env.BASE_PATH || '/aq-monitor';

app.use(cors());
app.use(express.json());

// Routes
app.use(`${BASE_PATH}/api/auth`, authRoutes);
app.use(`${BASE_PATH}/api/queues`, queuesRoutes);
app.use(`${BASE_PATH}/api/analytics`, analyticsRoutes);
app.use(`${BASE_PATH}/api/system`, systemRoutes);
app.use(`${BASE_PATH}/api/admin`, adminRoutes);

async function startServer() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');
    
    // Load configuration
    loadConfig();
    logger.info('Configuration loaded');
    
    // Initialize Oracle connection pools
    await initializeOraclePools();
    logger.info('Oracle pools initialized');
    
    // Start polling queues
    await startPolling();
    logger.info('Queue polling started');
    
    // Load SSL cert/key paths from config
    const config = JSON.parse(fs.readFileSync(path.resolve('config/config.json'), 'utf-8'));
    const sslConfig = config.ssl || {};
    const sslEnabled = sslConfig.enabled === true;
    const sslCertPath = process.env.SSL_CERT_PATH || sslConfig.cert;
    const sslKeyPath = process.env.SSL_KEY_PATH || sslConfig.key;

    logger.info(`SSL enabled flag: ${sslEnabled}`);
    logger.info(`Checking for SSL cert at: ${sslCertPath}`);
    logger.info(`Checking for SSL key at: ${sslKeyPath}`);

    if (sslEnabled) {
      // If both cert and key exist, use HTTPS, else fallback to HTTP
      const certExists = fs.existsSync(sslCertPath);
      const keyExists = fs.existsSync(sslKeyPath);
      if (certExists && keyExists) {
        logger.info(`SSL cert found at: ${sslCertPath}`);
        logger.info(`SSL key found at: ${sslKeyPath}`);
        try {
          const sslOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
          };
          logger.info('SSL cert/key loaded, starting HTTPS server.');
          https.createServer(sslOptions, app).listen(PORT, () => {
            logger.info(`AQ Monitor backend HTTPS listening on ${PORT}`);
          });
        } catch (sslReadErr) {
          logger.error({ sslReadErr }, `Error reading SSL cert or key. Falling back to HTTP.`);
          app.listen(PORT, () => {
            logger.info(`AQ Monitor backend listening on ${PORT}`);
          });
        }
      } else {
        if (!certExists) logger.warn(`SSL cert not found at: ${sslCertPath}`);
        if (!keyExists) logger.warn(`SSL key not found at: ${sslKeyPath}`);
        logger.warn(`SSL cert or key not found or unreadable. Starting HTTP server.`);
        app.listen(PORT, () => {
          logger.info(`AQ Monitor backend listening on ${PORT}`);
        });
      }
    } else {
      logger.info('SSL is disabled by config. Starting HTTP server.');
      app.listen(PORT, () => {
        logger.info(`AQ Monitor backend listening on ${PORT}`);
      });
    }
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();