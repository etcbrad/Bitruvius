import { Router } from 'express';

const router = Router();

// Storage routes
router.get('/list', (req, res) => {
  res.json({ files: [] });
});

export { router as storageRoutes };
