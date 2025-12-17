import sqlite3 from 'sqlite3';
import path from 'path';
const dbFile = process.env.SQLITE_FILE || './data/aq-monitor.db';
const db = new sqlite3.Database(dbFile);

interface Snapshot {
  dbId: string; queueName: string; group: string;
  messageCount: number; lastEnqueue: any; polledAt: Date;
}

export async function saveSnapshot(s: Snapshot) {
  return new Promise<void>((resolve, reject)=>{
    db.run(`INSERT INTO queue_snapshots
      (db_id, queue_name, grp, message_count, last_enqueue, polled_at)
      VALUES (?,?,?,?,?,?)`,
      [s.dbId, s.queueName, s.group, s.messageCount, s.lastEnqueue, s.polledAt.toISOString()],
      err => err ? reject(err) : resolve());
  });
}

export async function listLatestSnapshots() {
  return new Promise<any[]>((resolve,reject)=>{
    db.all(`SELECT * FROM queue_snapshots
            WHERE polled_at IN (
              SELECT MAX(polled_at) FROM queue_snapshots GROUP BY queue_name, db_id
            )`,[],(err,rows)=> err?reject(err):resolve(rows));
  });
}