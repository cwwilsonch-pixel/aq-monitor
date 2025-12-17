import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getLatestSnapshots } from '../db/snapshotStore.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const dbId = req.query.dbId as string | undefined;
    const snapshots = await getLatestSnapshots(dbId);
    res.json(snapshots);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get queues');
    res.status(500).json({ error: 'Failed to get queues' });
  }
});

export default router;