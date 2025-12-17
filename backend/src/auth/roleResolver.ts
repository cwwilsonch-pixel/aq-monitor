import { Request, Response, NextFunction } from 'express';

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) return res.status(401).end();
    const roles: string[] = user.roles || [];
    if (!roles.includes(role)) return res.status(403).end();
    next();
  };
}