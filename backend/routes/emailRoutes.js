import express from 'express';
import {
  fetchMerchantEmails,
  getMerchantEmails,
  getMerchantThreads,
  getThreadEmails
} from '../controllers/emailController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// POST /api/emails/fetch/:merchantId - Fetch emails from Gmail for a merchant
router.post('/fetch/:merchantId', fetchMerchantEmails);

// GET /api/emails/merchant/:merchantId - Get all emails for a merchant
router.get('/merchant/:merchantId', getMerchantEmails);

// GET /api/emails/threads/:merchantId - Get all threads for a merchant
router.get('/threads/:merchantId', getMerchantThreads);

// GET /api/emails/thread/:threadId - Get all emails in a specific thread
router.get('/thread/:threadId', getThreadEmails);

export default router;