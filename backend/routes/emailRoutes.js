import express from 'express';
import {
  fetchEmailsForMerchant,
  getMerchantThreads,
  getThreadEmails,
  getMerchantEmails
} from '../controllers/emailController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Fetch emails for merchant (manual trigger)
router.post('/fetch/:merchantId', fetchEmailsForMerchant);

// Get all threads for merchant
router.get('/threads/:merchantId', getMerchantThreads);

// Get specific thread with all emails
router.get('/thread/:threadId', getThreadEmails);

// Get all emails for merchant
router.get('/merchant/:merchantId', getMerchantEmails);

export default router;
