import ldap from 'ldapjs';
import { logger } from '../utils/logger.js';

export async function ldapAuthenticate(username: string, password: string) {
  if (process.env.LDAP_ENABLED !== 'true') return null;
  const client = ldap.createClient({ url: process.env.LDAP_URL! });
  return new Promise((resolve, reject) => {
    client.bind(process.env.LDAP_BIND_DN!, process.env.LDAP_BIND_PASSWORD!, (err: any) => {
      if (err) {
        logger.warn(err, 'LDAP bind failed');
        client.unbind();
        return reject(err);
      }
      const base = process.env.LDAP_SEARCH_BASE!;
      const filter = `(uid=${username})`;
      client.search(base, { filter, scope: 'sub' }, (err2: any, res: any) => {
        if (err2) { client.unbind(); return reject(err2); }
        let entryDN: string | null = null;
        res.on('searchEntry', (e: any) => entryDN = e.objectName || e.dn);
        res.on('end', () => {
          if (!entryDN) { client.unbind(); return reject(new Error('User not found')); }
          client.bind(entryDN, password, (bindErr: any) => {
            client.unbind();
            if (bindErr) return reject(bindErr);
            resolve({ username });
          });
        });
      });
    });
  });
}