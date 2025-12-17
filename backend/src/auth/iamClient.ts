import fs from 'fs';
import path from 'path';

export async function resolveRoles(username: string): Promise<string[]> {
  if (process.env.IAM_ENABLED !== 'true') return [];
  if (process.env.IAM_ROLE_SOURCE === 'file') {
    const file = path.resolve(process.cwd(), 'config', 'roles.json');
    if (!fs.existsSync(file)) return [];
    const map = JSON.parse(fs.readFileSync(file,'utf-8'));
    return map[username] || [];
  }
  // Placeholder for external IAM integration
  return [];
}