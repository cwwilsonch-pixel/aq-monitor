import oracledb from 'oracledb';
import { getConnection } from './oraclePool.js';
import { saveSnapshot, saveSnapshotBatch } from '../db/snapshotStore.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config/configManager.js';
import { sendBlockedQueueAlert } from '../services/emailService.js';
import sqlite3 from 'sqlite3';

let pollingInterval: NodeJS.Timeout | null = null;

// Excluded queue patterns (hardcoded system exclusions)
const SYSTEM_EXCLUDED_QUEUE_PATTERNS = [
  '_E$',           // Exception queues
  '_S$',           // Staging queues
  'AQ$_',          // System AQ tables
];

// Excluded owners (hardcoded system exclusions)
const SYSTEM_EXCLUDED_OWNERS = [
  'SYS',
  'SYSTEM',
  'WMSYS',
  'DBSNMP',
  'OUTLN',
  'EXFSYS',
  'XDB',
  'CTXSYS',
  'MDSYS',
  'OLAPSYS',
  'ORDSYS',
  'ORDDATA',
  'SI_INFORMTN_SCHEMA',
  'SQLTXPLAIN',
  'DVSYS',
  'OJVMSYS',
  'ORDPLUGINS',
  'SYSMAN',
  'MDDATA',
  'SPATIAL_CSW_ADMIN_USR',
  'SPATIAL_WFS_ADMIN_USR',
  'APEX_PUBLIC_USER',
  'FLOWS_FILES',
  'APPQOSSYS',
  'ANONYMOUS',
  'XS$NULL',
  'GSMADMIN_INTERNAL',
  'DIP',
  'ORACLE_OCM',
  'REMOTE_SCHEDULER_AGENT',
  'SYSBACKUP',
  'SYSDG',
  'SYSKM',
  'SYSRAC',
  'AUDSYS',
  'GSMCATUSER',
  'GSMUSER'
];

function shouldExcludeQueue(owner: string, queueName: string): boolean {
  const cfg = getConfig();
  
  // Combine system exclusions with config exclusions
  const excludedOwners = [
    ...SYSTEM_EXCLUDED_OWNERS,
    ...(cfg.exclusions?.owners || [])
  ];
  
  const excludedPatterns = [
    ...SYSTEM_EXCLUDED_QUEUE_PATTERNS,
    ...(cfg.exclusions?.queuePatterns || [])
  ];
  
  // Check owner exclusion
  if (excludedOwners.map(o => o.toUpperCase()).includes(owner.toUpperCase())) {
    return true;
  }
  
  // Check queue name patterns
  const fullQueueName = `${owner}.${queueName}`;
  for (const pattern of excludedPatterns) {
    if (queueName.endsWith(pattern.replace('$', '')) || fullQueueName.startsWith(pattern)) {
      return true;
    }
  }
  
  return false;
}

async function cleanExcludedQueuesFromDB() {
  const cfg = getConfig();
  const excludedOwners = [
    ...SYSTEM_EXCLUDED_OWNERS,
    ...(cfg.exclusions?.owners || [])
  ];
  
  const excludeQueues = cfg.queueDiscovery?.excludeQueues || [];
  
  if (excludedOwners.length === 0 && excludeQueues.length === 0) {
    return;
  }
  
  const dbFile = process.env.SQLITE_FILE || './data/aq-monitor.db';
  
  return new Promise<void>((resolve) => {
    const db = new sqlite3.Database(dbFile);
    
    const conditions: string[] = [];
    
    // Add owner-based exclusions
    if (excludedOwners.length > 0) {
      conditions.push(...excludedOwners.map(owner => `queue_name LIKE '${owner}.%'`));
    }
    
    // Add queue name exclusions
    if (excludeQueues.length > 0) {
      conditions.push(...excludeQueues.map(qname => `queue_name LIKE '%.${qname}'`));
    }
    
    const whereClause = conditions.join(' OR ');
    
    db.run(
      `DELETE FROM queue_snapshots WHERE ${whereClause}`,
      function(err) {
        db.close();
        if (err) {
          logger.error({ err: err.message }, 'Failed to clean excluded queue snapshots');
        } else if (this.changes > 0) {
          logger.info({ 
            deletedRows: this.changes, 
            excludedOwners, 
            excludeQueues 
          }, 'Cleaned excluded queue snapshots from database');
        }
        resolve();
      }
    );
  });
}

export async function startPolling() {
  const cfg = getConfig();
  const intervalMs = cfg.polling?.intervalMs || 10000;
  
  // Clean excluded queues from DB first
  logger.info('Cleaning excluded queues from database...');
  await cleanExcludedQueuesFromDB();
  
  // Poll immediately
  logger.info('Starting initial poll...');
  await pollQueues();
  
  // Then poll at intervals with error handling
  pollingInterval = setInterval(async () => {
    try {
      await pollQueues();
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error in polling interval - continuing');
    }
  }, intervalMs);
  
  logger.info({ intervalMs }, 'Polling started');
}

export function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    logger.info('Polling stopped');
  }
}

async function pollDatabase(dbId: string) {
  const cfg = getConfig();
  let conn;

  try {
    // Get initial connection with timeout handling
    try {
      conn = await getConnection(dbId);
    } catch (connErr: any) {
      logger.warn({ err: connErr.message, dbId }, 'Database connection failed - will retry on next poll cycle');
      return;
    }

    // Get queue discovery config
    const excludeQueues = cfg.queueDiscovery?.excludeQueues || [];
    const excludeTables = cfg.queueDiscovery?.excludeQueueTables || [];
    const includePattern = new RegExp(cfg.queueDiscovery?.includePattern || '.*');
    const includeSystemUsers = cfg.queueDiscovery?.includeSystemUsers || [];

    const queuesSql = `
      SELECT qt.OWNER, qt.NAME as QUEUE_NAME, qt.QUEUE_TABLE
      FROM DBA_QUEUES qt
      WHERE qt.QUEUE_TYPE = 'NORMAL_QUEUE'
        AND qt.NAME NOT LIKE '%\\_E' ESCAPE '\\'
        AND qt.NAME NOT LIKE '%\\_S' ESCAPE '\\'
        AND qt.NAME NOT LIKE 'AQ$\\_%' ESCAPE '\\'
      ORDER BY qt.OWNER, qt.NAME
    `;

    let queuesResult;
    try {
      queuesResult = await conn.execute(queuesSql, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    } catch (queryErr: any) {
      logger.error({ err: queryErr.message, dbId }, 'Failed to query DBA_QUEUES - skipping this poll cycle');
      await conn.close();
      return;
    }

    if (!queuesResult.rows || queuesResult.rows.length === 0) {
      await conn.close();
      logger.warn({ dbId }, 'No queues found');
      return;
    }

    // Filter out excluded queues using both old and new exclusion logic
    const filteredQueues = (queuesResult.rows as any[]).filter(q => {
      // Filter by system users if includeSystemUsers is specified
      if (includeSystemUsers.length > 0 && !includeSystemUsers.includes(q.OWNER)) {
        return false;
      }
      
      // Old exclusion logic (owners)
      if (shouldExcludeQueue(q.OWNER, q.QUEUE_NAME)) {
        return false;
      }
      
      // New exclusion logic from queueDiscovery config
      if (excludeQueues.includes(q.QUEUE_NAME)) {
        return false;
      }
      
      if (excludeTables.includes(q.QUEUE_TABLE)) {
        return false;
      }
      
      if (!includePattern.test(q.QUEUE_NAME)) {
        return false;
      }
      
      return true;
    });

    logger.info({ 
      count: filteredQueues.length, 
      excluded: queuesResult.rows.length - filteredQueues.length,
      excludeQueues,
      excludeTables,
      includeSystemUsers
    }, 'Discovered queues');

    // Close the initial connection before parallel queries
    try {
      await conn.close();
    } catch (closeErr: any) {
      logger.warn({ err: closeErr.message, dbId }, 'Failed to close initial connection - continuing anyway');
    }

    // Poll all queues in parallel for better performance
    const pollingStartTime = Date.now();
    const snapshots = await Promise.all(
      filteredQueues.map(async (queueRow) => {
        let queueConn;
        try {
          // Get a dedicated connection for this queue
          queueConn = await getConnection(dbId);
          
          // Get READY count
          const countSql = `
            SELECT COUNT(*) as msg_count
            FROM ${queueRow.OWNER}.${queueRow.QUEUE_TABLE} t
            JOIN ${queueRow.OWNER}.AQ$${queueRow.QUEUE_TABLE} v ON t.msgid = v.msg_id
            WHERE t.q_name = :qname
              AND v.msg_state = 'READY'
          `;
          
          // Get last dequeue time from ALL messages (especially PROCESSED ones)
          const lastDeqSql = `
            SELECT MAX(deq_timestamp) as last_dequeued
            FROM ${queueRow.OWNER}.AQ$${queueRow.QUEUE_TABLE}
            WHERE queue = :qname
              AND msg_state = 'PROCESSED'
          `;
          
          const countResult = await queueConn.execute(
            countSql, 
            { qname: queueRow.QUEUE_NAME },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          
          const lastDeqResult = await queueConn.execute(
            lastDeqSql,
            { qname: queueRow.QUEUE_NAME },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          
          const countRow = countResult.rows && countResult.rows.length > 0 ? (countResult.rows[0] as any) : null;
          const messageCount = countRow ? Number(countRow.MSG_COUNT) || 0 : 0;
          
          const deqRow = lastDeqResult.rows && lastDeqResult.rows.length > 0 ? (lastDeqResult.rows[0] as any) : null;
          const lastDequeued = deqRow && deqRow.LAST_DEQUEUED ? new Date(deqRow.LAST_DEQUEUED).toISOString() : null;
          
          return {
            queue_name: `${queueRow.OWNER}.${queueRow.QUEUE_NAME}`,
            db_id: dbId,
            message_count: messageCount,
            polled_at: new Date().toISOString(),
            last_dequeued: lastDequeued
          };
          
        } catch (err: any) {
          logger.warn({ 
            queue: `${queueRow.OWNER}.${queueRow.QUEUE_NAME}`,
            dbId,
            err: err.message 
          }, 'Failed to count messages for queue');
          
          // Return snapshot with 0 count if query fails
          return {
            queue_name: `${queueRow.OWNER}.${queueRow.QUEUE_NAME}`,
            db_id: dbId,
            message_count: 0,
            polled_at: new Date().toISOString(),
            last_dequeued: null
          };
        } finally {
          // Close connection for this queue
          if (queueConn) {
            try {
              await queueConn.close();
            } catch (err) {
              // ignore close errors
            }
          }
        }
      })
    );

    const pollingDuration = Date.now() - pollingStartTime;
    logger.info({ 
      queueCount: snapshots.length, 
      durationMs: pollingDuration,
      avgPerQueue: Math.round(pollingDuration / snapshots.length)
    }, 'Parallel queue polling completed');

    // Batch insert all snapshots with error handling
    try {
      await saveSnapshotBatch(snapshots);
    } catch (err: any) {
      logger.error({ err: err.message, dbId, snapshotCount: snapshots.length }, 'Failed to save snapshots batch - continuing');
      // Try to save individually as fallback
      for (const snapshot of snapshots) {
        try {
          await saveSnapshot(snapshot);
        } catch (saveErr: any) {
          logger.error({ err: saveErr.message, dbId, queue: snapshot.queue_name }, 'Failed to save individual snapshot');
        }
      }
    }
    
    // Check for blocked queues and send email alerts
    await checkBlockedQueuesAndAlert(snapshots, dbId);
    
  } catch (err: any) {
    logger.warn({ err: err.message, dbId }, 'Error polling database - will retry on next interval');
  }
}

/**
 * Check snapshots for blocked queues and send email alerts
 */
async function checkBlockedQueuesAndAlert(snapshots: Array<{ queue_name: string; message_count: number; polled_at: string; last_dequeued: string | null }>, dbId: string) {
  const environment = process.env.NODE_ENV || 'development';
  const blockedThresholdMs = 5 * 60 * 1000; // 5 minutes
  
  // Get database info from config
  const cfg = getConfig();
  const dbConfig = cfg.databases.find(db => db.id === dbId);
  
  // Check if email is enabled for this database
  if (!dbConfig || dbConfig.emailEnabled === false) {
    return; // Skip email alerts for this database
  }
  
  const connectString = dbConfig.connectString || 'Unknown';
  
  // Extract SERVICE_NAME and get SID (same logic as frontend)
  // Format: SERVICE_NAME=t2kench_srv.swi.srse.net -> T2KENCH
  const serviceMatch = connectString.match(/SERVICE_NAME=([^)]+)/i);
  const serviceName = serviceMatch ? serviceMatch[1] : 'Unknown';
  const database = serviceName.split('_')[0].split('.')[0].toUpperCase();
  
  for (const snapshot of snapshots) {
    // Check if queue is blocked:
    // 1. Has messages ready (message_count > 0)
    // 2. Last dequeued is either null OR more than 5 minutes ago
    if (snapshot.message_count > 0) {
      let isBlocked = false;
      
      if (!snapshot.last_dequeued) {
        // Never been dequeued
        isBlocked = true;
      } else {
        const lastDeqTime = new Date(snapshot.last_dequeued).getTime();
        const timeSinceDequeue = Date.now() - lastDeqTime;
        isBlocked = timeSinceDequeue > blockedThresholdMs;
      }
      
      if (isBlocked) {
        // Send email alert (with cooldown handled in emailService)
        try {
          await sendBlockedQueueAlert({
            queueName: snapshot.queue_name,
            messageCount: snapshot.message_count,
            lastDequeued: snapshot.last_dequeued,
            environment: environment,
            database: database,
            dbId: dbId
          });
        } catch (err: any) {
          logger.error({ err: err.message, dbId, queue: snapshot.queue_name }, 'Error sending blocked queue alert');
        }
      }
    }
  }
}

export async function pollQueues() {
  const cfg = getConfig();
  
  // Poll all databases in parallel
  await Promise.all(
    cfg.databases.map(async (db) => {
      try {
        logger.info({ dbId: db.id }, 'Polling database');
        await pollDatabase(db.id);
      } catch (err: any) {
        logger.error({ err: err.message, dbId: db.id }, 'Error polling database - continuing with others');
      }
    })
  );
}