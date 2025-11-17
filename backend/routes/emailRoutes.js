import express from 'express';
import {
  fetchMerchantEmails,        // ✅ FIXED: was fetchEmailsForMerchant
  getMerchantThreads,
  getThreadEmails,
  getMerchantEmails,
  testReminder                // ✅ FIXED: was testReminderEmail
} from '../controllers/emailController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Test reminder email (bypasses working hours)
router.post('/test-reminder/:merchantId', testReminder);  // ✅ FIXED

// Fetch emails for merchant (manual trigger)
router.post('/fetch/:merchantId', fetchMerchantEmails);  // ✅ FIXED

// Get all threads for merchant
router.get('/threads/:merchantId', getMerchantThreads);

// Get specific thread with all emails
router.get('/thread/:threadId', getThreadEmails);

// Get all emails for merchant
router.get('/merchant/:merchantId', getMerchantEmails);

export default router;