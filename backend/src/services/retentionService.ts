import sqlite3 from 'sqlite3';
const db = new sqlite3.Database(process.env.SQLITE_FILE || './data/aq-monitor.db');
export function purgeOld(days: number) {
  const cutoff = new Date(Date.now() - days*86400000).toISOString();
  db.run(`DELETE FROM queue_snapshots WHERE polled_at < ?`, [cutoff]);
}