import express from 'express';
import {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  restartScheduler,
  startMerchantScheduler,
  stopMerchantScheduler
} from '../controllers/schedulerController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/scheduler/start - Start scheduler for all merchants
router.post('/start', startScheduler);

// POST /api/scheduler/stop - Stop scheduler for all merchants
router.post('/stop', stopScheduler);

// GET /api/scheduler/status - Get scheduler status
router.get('/status', getSchedulerStatus);

// POST /api/scheduler/restart - Restart scheduler
router.post('/restart', restartScheduler);

// POST /api/scheduler/merchant/:merchantId/start - Start for specific merchant
router.post('/merchant/:merchantId/start', startMerchantScheduler);

// POST /api/scheduler/merchant/:merchantId/stop - Stop for specific merchant
router.post('/merchant/:merchantId/stop', stopMerchantScheduler);

export default router;