import { getConnection } from '../aq/oraclePool.js';
import { getConfig } from '../config/configManager.js';
import { logger } from '../utils/logger.js';
import oracledb from 'oracledb';
export async function discoverQueues(dbId) {
    const config = getConfig(); // Get config inside the function
    const conn = await getConnection(dbId);
    const sql = `
    SELECT OWNER, NAME, QUEUE_TABLE
    FROM DBA_QUEUES
    WHERE QUEUE_TYPE = 'NORMAL_QUEUE'
    ORDER BY OWNER, NAME
  `;
    const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
    await conn.close();
    const rows = result.rows;
    const discovered = [];
    const skipped = [];
    // Get exclusion lists from config
    const excludeTables = config.queueDiscovery?.excludeQueueTables || [];
    const excludeQueues = config.queueDiscovery?.excludeQueues || [];
    const includePattern = new RegExp(config.queueDiscovery?.includePattern || '.*');
    const includeSystemUsers = config.queueDiscovery?.includeSystemUsers || [];
    // Log all queues found in database
    const allQueues = rows.map((row) => `${row.OWNER}.${row.NAME} (table: ${row.QUEUE_TABLE})`);
    logger.info({
        totalQueuesInDatabase: rows.length,
        allQueues
    }, 'All queues found in DBA_QUEUES');
    // Log filter configuration
    logger.info({
        excludeTables,
        excludeQueues,
        includePattern: config.queueDiscovery?.includePattern || '.*',
        includeSystemUsers,
        groupByPrefix: config.queueDiscovery?.groupByPrefix
    }, 'Queue discovery filters');
    for (const row of rows) {
        const queueTable = row.QUEUE_TABLE;
        const queueName = row.NAME;
        const queueOwner = row.OWNER;
        const fullName = `${queueOwner}.${queueName}`;
        // Apply filters with logging
        // Filter by system users if includeSystemUsers is specified
        if (includeSystemUsers.length > 0 && !includeSystemUsers.includes(queueOwner)) {
            skipped.push({ queue: fullName, reason: `Owner not in includeSystemUsers list` });
            continue;
        }
        if (excludeTables.includes(queueTable)) {
            skipped.push({ queue: fullName, reason: `Excluded by queue table: ${queueTable}` });
            continue;
        }
        if (excludeQueues.includes(queueName)) {
            skipped.push({ queue: fullName, reason: `Excluded by queue name: ${queueName}` });
            continue;
        }
        if (!includePattern.test(queueName)) {
            skipped.push({ queue: fullName, reason: `Does not match include pattern: ${config.queueDiscovery?.includePattern}` });
            continue;
        }
        // Determine group (by prefix or queue table)
        let group = 'default';
        if (config.queueDiscovery?.groupByPrefix) {
            // Find first occurrence of 3 consecutive letters
            const match = queueName.match(/([A-Z]{3,})/i);
            if (match) {
                group = match[1].substring(0, 3).toLowerCase();
            }
        }
        else {
            group = queueTable.toLowerCase();
        }
        discovered.push({
            owner: row.OWNER,
            name: queueName,
            queueTable,
            group
        });
    }
    // Log discovered and skipped queues
    logger.info({
        count: discovered.length,
        excluded: skipped.length,
        totalScanned: rows.length
    }, 'Discovered queues');
    if (skipped.length > 0) {
        logger.info({ skipped }, 'Skipped queues details');
        // Group skipped by reason for summary
        const skippedByReason = skipped.reduce((acc, item) => {
            if (!acc[item.reason]) {
                acc[item.reason] = [];
            }
            acc[item.reason].push(item.queue);
            return acc;
        }, {});
        logger.info({ skippedByReason }, 'Skipped queues summary');
    }
    else {
        logger.info('No queues were skipped - all queues in DBA_QUEUES are being monitored');
    }
    return discovered;
}
export async function discoverAllQueues(config) {
    const allQueues = [];
    if (!config.queueDiscovery?.enabled) {
        logger.info('Queue discovery is disabled');
        return allQueues;
    }
    for (const db of config.databases) {
        const queues = await discoverQueues(db.id);
        allQueues.push(...queues);
    }
    return allQueues;
}
