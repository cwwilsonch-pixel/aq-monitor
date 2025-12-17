import { Request, Response, NextFunction } from 'express';
export function securityHeaders() {
  return (_req: Request, res: Response, next: NextFunction)=>{
    res.setHeader('X-Frame-Options','SAMEORIGIN');
    res.setHeader('X-Content-Type-Options','nosniff');
    next();
  };
}