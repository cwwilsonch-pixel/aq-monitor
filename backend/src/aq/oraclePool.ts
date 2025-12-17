import oracledb from 'oracledb';
import { getConfig } from '../config/configManager.js';
import { logger } from '../utils/logger.js';

const pools = new Map<string, oracledb.Pool>();

export async function initializeOraclePools() {
  const config = getConfig();
  
  // Set global statement cache size
  oracledb.stmtCacheSize = 30;
  
  // Try to initialize thick mode (required for Advanced Networking encryption)
  // If it fails, fall back to thin mode
  try {
    const libDir = process.env.ORACLE_HOME || '/opt/oracle/instantclient';
    oracledb.initOracleClient({ libDir });
    logger.info({ libDir }, 'Oracle thick mode initialized - Advanced Networking features enabled');
  } catch (err: any) {
    logger.warn({ err: err.message }, 'Could not initialize thick mode - using thin mode (Advanced Networking not available)');
    // Continue with thin mode - don't throw
  }
  
  for (const db of config.databases) {
    logger.info({
      dbId: db.id,
      connectString: db.connectString,
      poolMin: db.poolMin,
      poolMax: db.poolMax
    }, 'Attempting to create Oracle pool with config');
    try {
      const pool = await oracledb.createPool({
        user: db.user,
        password: db.password,
        connectString: db.connectString,
        poolMin: db.poolMin,
        poolMax: db.poolMax,
        poolIncrement: 2,
        poolTimeout: 60,
        queueTimeout: 60000,  // Increased to 60 seconds
        connectTimeout: 30    // Increased to 30 seconds
      });
      pools.set(db.id, pool);
      logger.info({ dbId: db.id }, 'Oracle pool created');
    } catch (err: any) {
      logger.error({
        dbId: db.id,
        err: err.message,
        stack: err.stack,
        config: {
          user: db.user,
          connectString: db.connectString,
          poolMin: db.poolMin,
          poolMax: db.poolMax
        }
      }, 'Failed to create Oracle pool - will retry on next poll cycle');
      // Don't throw - continue with other databases
    }
  }
}

export async function getConnection(dbId: string): Promise<oracledb.Connection> {
  const pool = pools.get(dbId);
  if (!pool) {
    const error = new Error(`No pool found for database: ${dbId}`);
    logger.warn({ dbId }, 'Connection pool not available - database may be unavailable');
    throw error;
  }
  
  try {
    return await pool.getConnection();
  } catch (err: any) {
    logger.error({ dbId, err: err.message }, 'Failed to get connection from pool - database may be locked or unavailable');
    throw err;
  }
}

export async function closeAllPools() {
  for (const [dbId, pool] of pools.entries()) {
    try {
      await pool.close(10);
      logger.info({ dbId }, 'Oracle pool closed');
    } catch (err: any) {
      logger.error({ dbId, err: err.message }, 'Failed to close Oracle pool');
    }
  }
  pools.clear();
}