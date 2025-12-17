import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'missing token' });
  try {
    const decoded = jwt.verify(h.substring(7), process.env.JWT_SECRET!);
    (req as any).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}