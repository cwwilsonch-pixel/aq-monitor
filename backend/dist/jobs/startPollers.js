import { startPolling } from '../aq/aqPoller.js';
export async function startPollers() {
    await startPolling();
}
