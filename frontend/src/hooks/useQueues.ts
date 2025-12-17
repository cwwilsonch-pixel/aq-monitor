import { useEffect, useState, useCallback } from 'react';
import { config } from '../config';

export function useQueues(token: string|null, dbId?: string) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hasLoaded, setHasLoaded] = useState<boolean>(false);
  
  const fetchQueues = useCallback(async () => {
    if (!token) return;
    try {
      // Only set loading true on first load
      if (!hasLoaded) {
        setLoading(true);
      }
      const url = dbId 
        ? `${config.endpoints.queues.list}?dbId=${encodeURIComponent(dbId)}`
        : config.endpoints.queues.list;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await response.json();
      setData(json);
      setHasLoaded(true);
      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch queues:', err);
      setData([]);
      setHasLoaded(true);
      setLoading(false);
    }
  }, [token, dbId, hasLoaded]);
  
  useEffect(() => {
    setHasLoaded(false);
    setLoading(true);
    fetchQueues();
    const interval = setInterval(fetchQueues, 10000); // Auto-refresh every 10s
    return () => clearInterval(interval);
  }, [token, dbId]);
  
  return { data, loading, hasLoaded, refetch: fetchQueues };
}