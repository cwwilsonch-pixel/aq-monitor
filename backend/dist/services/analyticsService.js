import { getConnection } from '../aq/oraclePool.js';
import oracledb from 'oracledb';
import { logger } from '../utils/logger.js';
import sqlite3 from 'sqlite3';
const dbFile = process.env.SQLITE_FILE || './data/aq-monitor.db';
async function getDbIdForQueue(queueName) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbFile);
        db.get(`SELECT db_id FROM queue_snapshots 
       WHERE queue_name = ? 
       ORDER BY polled_at DESC 
       LIMIT 1`, [queueName], (err, row) => {
            db.close();
            if (err) {
                reject(err);
            }
            else {
                resolve(row ? row.db_id : null);
            }
        });
    });
}
export async function getQueueMetrics(queueName, dbId) {
    const [owner, queue] = queueName.split('.');
    if (!owner || !queue) {
        throw new Error('Invalid queue name');
    }
    // If dbId not provided, find which database this queue belongs to by checking snapshots
    let resolvedDbId = dbId;
    if (!resolvedDbId) {
        resolvedDbId = await getDbIdForQueue(queueName);
    }
    if (!resolvedDbId) {
        throw new Error(`Queue ${queueName} not found in any database`);
    }
    let conn;
    try {
        conn = await getConnection(resolvedDbId);
        // Get queue table name
        const queueInfoSql = `
      SELECT QUEUE_TABLE 
      FROM DBA_QUEUES 
      WHERE OWNER = :owner AND NAME = :queue
    `;
        const queueInfoResult = await conn.execute(queueInfoSql, { owner, queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (!queueInfoResult.rows || queueInfoResult.rows.length === 0) {
            await conn.close();
            throw new Error('Queue not found');
        }
        const queueTable = queueInfoResult.rows[0].QUEUE_TABLE;
        const aqViewName = `${owner}.AQ$${queueTable}`;
        // Get current READY message count
        let readyCount = 0;
        try {
            const readyCountSql = `
        SELECT COUNT(*) as ready_count
        FROM ${owner}.${queueTable} qt
        JOIN ${aqViewName} aq ON qt.msgid = aq.msg_id
        WHERE qt.q_name = :queue
          AND aq.msg_state = 'READY'
      `;
            const readyCountResult = await conn.execute(readyCountSql, { queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            readyCount = readyCountResult.rows && readyCountResult.rows.length > 0
                ? Number(readyCountResult.rows[0].READY_COUNT) || 0
                : 0;
        }
        catch (err) {
            logger.warn({ err: err.message, queueName }, 'Failed to get ready count');
        }
        // Get total messages enqueued in last 5 days
        const totalSql = `
      SELECT COUNT(*) as total
      FROM ${aqViewName}
      WHERE queue = :queue
        AND enq_timestamp >= TRUNC(SYSDATE) - 5
    `;
        const totalResult = await conn.execute(totalSql, { queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const totalMessages = totalResult.rows && totalResult.rows.length > 0
            ? Number(totalResult.rows[0].TOTAL) || 0
            : 0;
        // Get average messages per day
        const avgMessagesPerDay = Math.round(totalMessages / 5);
        // Get max dequeued per hour and peak hour time
        const peakHourSql = `
      SELECT 
        TO_CHAR(deq_timestamp, 'HH24') as hour,
        TO_CHAR(deq_timestamp, 'YYYY-MM-DD') as day,
        COUNT(*) as cnt
      FROM ${aqViewName}
      WHERE queue = :queue
        AND deq_timestamp >= TRUNC(SYSDATE) - 5
        AND msg_state = 'PROCESSED'
      GROUP BY TO_CHAR(deq_timestamp, 'HH24'), TO_CHAR(deq_timestamp, 'YYYY-MM-DD')
      ORDER BY cnt DESC
      FETCH FIRST 1 ROWS ONLY
    `;
        const peakResult = await conn.execute(peakHourSql, { queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        let maxPerHour = 0;
        let peakHourTime = 'N/A';
        if (peakResult.rows && peakResult.rows.length > 0) {
            const row = peakResult.rows[0];
            maxPerHour = Number(row.CNT) || 0;
            peakHourTime = `${row.DAY} ${row.HOUR}:00`;
        }
        // Get last processed time
        const lastProcessedSql = `
      SELECT MAX(deq_timestamp) as last_processed
      FROM ${aqViewName}
      WHERE queue = :queue
        AND msg_state = 'PROCESSED'
    `;
        const lastProcessedResult = await conn.execute(lastProcessedSql, { queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        let lastProcessedTime = null;
        if (lastProcessedResult.rows && lastProcessedResult.rows.length > 0) {
            const row = lastProcessedResult.rows[0];
            if (row.LAST_PROCESSED) {
                lastProcessedTime = row.LAST_PROCESSED.toISOString();
            }
        }
        // Get retry count statistics
        const retryStatsSql = `
      SELECT 
        COUNT(CASE WHEN retry_count > 0 THEN 1 END) as total_retried,
        MAX(retry_count) as max_retry_count
      FROM ${aqViewName}
      WHERE queue = :queue
    `;
        let totalRetried = 0;
        let maxRetryCount = 0;
        try {
            const retryStatsResult = await conn.execute(retryStatsSql, { queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            if (retryStatsResult.rows && retryStatsResult.rows.length > 0) {
                const row = retryStatsResult.rows[0];
                totalRetried = Number(row.TOTAL_RETRIED) || 0;
                maxRetryCount = Number(row.MAX_RETRY_COUNT) || 0;
            }
        }
        catch (err) {
            logger.warn({ err: err.message, queueName }, 'Failed to get retry stats');
        }
        // Get daily stats
        const dailyStatsSql = `
      SELECT 
        TO_CHAR(enq_timestamp, 'YYYY-MM-DD') as dt,
        COUNT(*) as cnt
      FROM ${aqViewName}
      WHERE queue = :queue
        AND enq_timestamp >= TRUNC(SYSDATE) - 5
      GROUP BY TO_CHAR(enq_timestamp, 'YYYY-MM-DD')
      ORDER BY dt DESC
    `;
        const dailyStatsResult = await conn.execute(dailyStatsSql, { queue }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const dailyStats = (dailyStatsResult.rows || []).map((row) => ({
            date: row.DT,
            count: Number(row.CNT) || 0
        }));
        await conn.close();
        return {
            queueName,
            readyCount,
            totalMessages,
            avgMessagesPerDay,
            maxPerHour,
            peakHourTime,
            lastProcessedTime,
            totalRetried,
            maxRetryCount,
            dailyStats
        };
    }
    catch (err) {
        logger.error({ err: err.message, queueName }, 'Failed to get queue metrics');
        if (conn) {
            try {
                await conn.close();
            }
            catch (closeErr) {
                // Ignore
            }
        }
        throw err;
    }
}
export async function getHistoricData(from, to) {
    const dbFile = process.env.SQLITE_FILE || './data/aq-monitor.db';
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbFile);
        db.all(`SELECT * FROM queue_snapshots 
       WHERE polled_at >= ? AND polled_at <= ? 
       ORDER BY polled_at ASC`, [from.toISOString(), to.toISOString()], (err, rows) => {
            db.close();
            if (err)
                reject(err);
            else
                resolve(rows || []);
        });
    });
}
