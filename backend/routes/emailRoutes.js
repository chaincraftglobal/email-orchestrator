import express from 'express';
import {
  fetchEmailsForMerchant,
  getMerchantThreads,
  getThreadEmails,
  getMerchantEmails,
  getRecentThreads
} from '../controllers/emailController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get recent threads across ALL merchants
router.get('/recent', getRecentThreads);

// Fetch emails for merchant (manual trigger)
router.post('/fetch/:merchantId', fetchEmailsForMerchant);

// Get all threads for merchant
router.get('/threads/:merchantId', getMerchantThreads);

// Get specific thread with all emails
router.get('/thread/:threadId', getThreadEmails);

// Get all emails for merchant
router.get('/merchant/:merchantId', getMerchantEmails);

export default router;
