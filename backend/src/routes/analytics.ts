import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { getQueueMetrics, getHistoricData } from '../services/analyticsService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/queue-metrics', authenticateToken, async (req, res) => {
  try {
    const queueName = req.query.queueName as string;
    const dbId = req.query.dbId as string | undefined;
    
    if (!queueName) {
      return res.status(400).json({ error: 'queueName is required' });
    }
    
    const metrics = await getQueueMetrics(queueName, dbId);
    res.json(metrics);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get queue metrics');
    res.status(500).json({ error: 'Failed to get queue metrics' });
  }
});

router.get('/historic', authenticateToken, async (req, res) => {
  try {
    const from = new Date(req.query.from as string);
    const to = new Date(req.query.to as string);
    
    const data = await getHistoricData(from, to);
    res.json(data);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to get historic data');
    res.status(500).json({ error: 'Failed to get historic data' });
  }
});

export default router;