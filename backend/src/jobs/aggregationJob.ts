import { runAggregation } from '../aq/aqMetricsAggregator.js';
export function scheduleAggregation(_cfg: any) {
  setInterval(()=> runAggregation().catch(()=>{}), 300000);
}