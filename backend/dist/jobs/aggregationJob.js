import { runAggregation } from '../aq/aqMetricsAggregator.js';
export function scheduleAggregation(_cfg) {
    setInterval(() => runAggregation().catch(() => { }), 300000);
}
