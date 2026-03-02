import { Router } from 'express';

const router = Router();

// API routes
router.get('/status', (req, res) => {
  res.json({ status: 'running' });
});

export { router as apiRoutes };
