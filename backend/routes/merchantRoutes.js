import express from 'express';
import {
  getAllMerchants,
  getMerchantById,
  testGmailConnection,
  createMerchant,
  updateMerchant,
  deleteMerchant
} from '../controllers/merchantController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/merchants - Get all merchants
router.get('/', getAllMerchants);

// GET /api/merchants/:id - Get single merchant
router.get('/:id', getMerchantById);

// POST /api/merchants/test-gmail - Test Gmail connection
router.post('/test-gmail', testGmailConnection);

// POST /api/merchants - Create new merchant
router.post('/', createMerchant);

// PUT /api/merchants/:id - Update merchant
router.put('/:id', updateMerchant);

// DELETE /api/merchants/:id - Delete merchant
router.delete('/:id', deleteMerchant);

export default router;