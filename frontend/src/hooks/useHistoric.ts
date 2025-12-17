import { useEffect, useState } from 'react';
import { config } from '../config';
export function useHistoric(token: string|null) {
  const [data,setData] = useState<any[]>([]);
  useEffect(()=>{
    if (!token) return;
    const to = new Date();
    const from = new Date(Date.now()-3600000);
    fetch(`${config.endpoints.analytics.historic}?from=${from.toISOString()}&to=${to.toISOString()}`, { headers:{ Authorization:`Bearer ${token}` }})
      .then(r=>r.json()).then(setData).catch(()=>{});
  },[token]);
  return { data };
}