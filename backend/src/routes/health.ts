import { Router } from 'express';
const r = Router();
r.get('/', (_req,res)=> res.json({ status:'ok', time: new Date().toISOString() }));
export default r;