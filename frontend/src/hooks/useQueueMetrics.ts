import { useEffect, useState } from 'react';
import { config } from '../config';

export function useQueueMetrics(token: string | null, queueName: string | null, dbId?: string) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!token || !queueName) {
      setData(null);
      return;
    }
    
    setLoading(true);
    
    const url = dbId 
      ? `${config.endpoints.analytics.queueMetrics}?queueName=${encodeURIComponent(queueName)}&dbId=${encodeURIComponent(dbId)}`
      : `${config.endpoints.analytics.queueMetrics}?queueName=${encodeURIComponent(queueName)}`;
    
    fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch queue metrics:', err);
        setLoading(false);
      });
  }, [token, queueName, dbId]);
  
  return { data, loading };
}