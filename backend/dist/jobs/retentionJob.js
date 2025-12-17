import { purgeOld } from '../services/retentionService.js';
export function scheduleRetention(cfg) {
    const days = Number(process.env.RETENTION_DAYS || 30);
    setInterval(() => purgeOld(days), 3600000);
}
