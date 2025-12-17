import sqlite3 from 'sqlite3';
import { logger } from '../utils/logger.js';
import * as fs from 'fs';
import * as path from 'path';

const dbFile = process.env.SQLITE_FILE || './data/aq-monitor.db';

// Helper to open database with busy timeout
function openDatabase(): sqlite3.Database {
  const db = new sqlite3.Database(dbFile);
  // Set busy timeout to 10 seconds
  db.run('PRAGMA busy_timeout = 10000');
  // Enable WAL mode for better concurrency
  db.run('PRAGMA journal_mode = WAL');
  return db;
}

interface QueueSnapshot {
  queue_name: string;
  db_id: string;
  message_count: number;
  polled_at: string;
  last_dequeued?: string | null;
}

export async function initDatabase() {
  return new Promise<void>((resolve, reject) => {
    // Ensure data directory exists
    const dir = path.dirname(dbFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const db = openDatabase();
    
    db.run(`
      CREATE TABLE IF NOT EXISTS queue_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        queue_name TEXT NOT NULL,
        db_id TEXT NOT NULL DEFAULT 'main',
        message_count INTEGER NOT NULL,
        polled_at TEXT NOT NULL,
        last_dequeued TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) {
        logger.error({ err: err.message }, 'Failed to create queue_snapshots table');
        db.close();
        reject(err);
      } else {
        // Create index on queue_name and polled_at for faster queries
        db.run(`
          CREATE INDEX IF NOT EXISTS idx_queue_snapshots_queue_polled 
          ON queue_snapshots(queue_name, polled_at DESC)
        `, (indexErr) => {
          if (indexErr) {
            db.close();
            logger.error({ err: indexErr.message }, 'Failed to create index');
            reject(indexErr);
          } else {
            // Migrate: Add columns if they don't exist (for existing databases)
            db.all(`PRAGMA table_info(queue_snapshots)`, (pragmaErr, columns: any[]) => {
              if (pragmaErr) {
                db.close();
                logger.error({ err: pragmaErr.message }, 'Failed to check table schema');
                reject(pragmaErr);
              } else {
                const hasLastDequeued = columns.some(col => col.name === 'last_dequeued');
                const hasDbId = columns.some(col => col.name === 'db_id');
                
                const migrations: Promise<void>[] = [];
                
                if (!hasLastDequeued) {
                  logger.info('Migrating database: adding last_dequeued column');
                  migrations.push(new Promise((res, rej) => {
                    db.run(`ALTER TABLE queue_snapshots ADD COLUMN last_dequeued TEXT`, (err) => {
                      if (err) rej(err);
                      else res();
                    });
                  }));
                }
                
                if (!hasDbId) {
                  logger.info('Migrating database: adding db_id column');
                  migrations.push(new Promise((res, rej) => {
                    db.run(`ALTER TABLE queue_snapshots ADD COLUMN db_id TEXT NOT NULL DEFAULT 'main'`, (err) => {
                      if (err) rej(err);
                      else res();
                    });
                  }));
                }
                
                if (migrations.length > 0) {
                  Promise.all(migrations)
                    .then(() => {
                      db.close();
                      logger.info('Database initialized and migrated successfully');
                      resolve();
                    })
                    .catch((err) => {
                      db.close();
                      logger.error({ err: err.message }, 'Failed to migrate database');
                      reject(err);
                    });
                } else {
                  db.close();
                  logger.info('Database initialized successfully');
                  resolve();
                }
              }
            });
          }
        });
      }
    });
  });
}

export async function saveSnapshot(snapshot: QueueSnapshot) {
  return new Promise<void>((resolve, reject) => {
    const db = openDatabase();
    
    db.run(
      `INSERT INTO queue_snapshots (queue_name, db_id, message_count, polled_at, last_dequeued) 
       VALUES (?, ?, ?, ?, ?)`,
      [snapshot.queue_name, snapshot.db_id, snapshot.message_count, snapshot.polled_at, snapshot.last_dequeued || null],
      (err) => {
        db.close();
        if (err) {
          logger.error({ err: err.message, snapshot }, 'Failed to save snapshot');
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

export async function saveSnapshotBatch(snapshots: QueueSnapshot[]) {
  if (snapshots.length === 0) {
    return;
  }

  return new Promise<void>((resolve, reject) => {
    const db = openDatabase();
    
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      const stmt = db.prepare(
        `INSERT INTO queue_snapshots (queue_name, db_id, message_count, polled_at, last_dequeued) 
         VALUES (?, ?, ?, ?, ?)`,
      );
      
      let errorOccurred = false;
      
      for (const snapshot of snapshots) {
        stmt.run(
          [snapshot.queue_name, snapshot.db_id, snapshot.message_count, snapshot.polled_at, snapshot.last_dequeued || null],
          (err) => {
            if (err && !errorOccurred) {
              errorOccurred = true;
              logger.error({ err: err.message, snapshot }, 'Failed to save snapshot in batch');
            }
          }
        );
      }
      
      stmt.finalize((err) => {
        if (err) {
          db.run('ROLLBACK', () => {
            db.close();
            reject(err);
          });
        } else {
          db.run('COMMIT', (commitErr) => {
            db.close();
            if (commitErr) {
              reject(commitErr);
            } else {
              logger.info({ count: snapshots.length }, 'Batch saved snapshots');
              resolve();
            }
          });
        }
      });
    });
  });
}

function calculateGroup(queueName: string): string {
  // Extract queue name without schema prefix (e.g., "SUNRISE.X_CIF_Q" -> "X_CIF_Q")
  const parts = queueName.split('.');
  const nameOnly = parts.length > 1 ? parts[1] : queueName;
  
  // Find first occurrence of 3 or more consecutive letters
  const match = nameOnly.match(/([A-Z]{3,})/i);
  if (match) {
    return match[1].substring(0, 3).toLowerCase();
  }
  return 'other';
}

export async function getLatestSnapshots(dbId?: string) {
  return new Promise<QueueSnapshot[]>((resolve, reject) => {
    const db = openDatabase();
    
    const whereClause = dbId ? 'AND db_id = ?' : '';
    const params = dbId ? [dbId] : [];
    
    db.all(`
      SELECT 
        queue_name,
        db_id,
        message_count,
        polled_at,
        last_dequeued
      FROM queue_snapshots
      WHERE (queue_name, polled_at) IN (
        SELECT queue_name, MAX(polled_at)
        FROM queue_snapshots
        ${whereClause ? 'WHERE db_id = ?' : ''}
        GROUP BY queue_name
      ) ${whereClause}
      ORDER BY queue_name
    `, params.length > 0 ? [...params, ...params] : [], (err, rows) => {
      db.close();
      if (err) {
        logger.error({ err: err.message }, 'Failed to get latest snapshots');
        reject(err);
      } else {
        // Add group to each snapshot
        const snapshotsWithGroup = (rows as QueueSnapshot[]).map(snapshot => ({
          ...snapshot,
          grp: calculateGroup(snapshot.queue_name)
        }));
        resolve(snapshotsWithGroup);
      }
    });
  });
}

export async function deleteQueueSnapshots(queueNames: string[]) {
  return new Promise<void>((resolve, reject) => {
    const db = openDatabase();
    const placeholders = queueNames.map(() => '?').join(', ');
    
    db.run(
      `DELETE FROM queue_snapshots WHERE queue_name IN (${placeholders})`,
      queueNames,
      function(err) {
        db.close();
        if (err) {
          logger.error({ err: err.message }, 'Failed to delete queue snapshots');
          reject(err);
        } else {
          logger.info({ deletedRows: this.changes, queues: queueNames.length }, 'Deleted excluded queue snapshots');
          resolve();
        }
      }
    );
  });
}

export async function cleanOldSnapshots(daysToKeep: number = 30) {
  return new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(dbFile);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    db.run(
      `DELETE FROM queue_snapshots WHERE polled_at < ?`,
      [cutoffDate.toISOString()],
      function(err) {
        db.close();
        if (err) {
          logger.error({ err: err.message }, 'Failed to clean old snapshots');
          reject(err);
        } else {
          logger.info({ deletedRows: this.changes, daysToKeep }, 'Cleaned old snapshots');
          resolve();
        }
      }
    );
  });
}