import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { logger } from '../utils/logger.js';
export async function initLiteDb(_cfg) {
    const file = process.env.SQLITE_FILE || './data/aq-monitor.db';
    const dir = path.dirname(file);
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`Created directory: ${dir}`);
    }
    const db = new sqlite3.Database(file);
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS queue_snapshots(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      db_id TEXT,
      queue_name TEXT,
      grp TEXT,
      message_count INTEGER,
      last_enqueue TEXT,
      polled_at TEXT
    )`, (err) => {
            if (err) {
                reject(err);
            }
            else {
                resolve();
            }
        });
    });
    db.close();
    logger.info(`SQLite initialized at: ${file}`);
}
