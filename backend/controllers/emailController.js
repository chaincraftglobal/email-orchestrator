import pool from '../config/database.js';
import EmailService from '../services/emailService.js';

// Fetch emails for a specific merchant (manual trigger)
export const fetchEmailsForMerchant = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    console.log(`📧 Manual fetch triggered for merchant ID: ${merchantId}`);
    
    // Get merchant details
    const merchantResult = await pool.query(
      'SELECT * FROM merchants WHERE id = $1',
      [merchantId]
    );
    
    if (merchantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }
    
    const merchant = merchantResult.rows[0];
    
    console.log(`📧 Fetching emails for: ${merchant.company_name}`);
    
    // Fetch emails using EmailService
    const result = await EmailService.fetchAndProcessEmails(merchant);
    
    console.log(`✅ Fetch complete. New emails: ${result.newEmails}, New threads: ${result.newThreads}`);
    
    res.json({
      success: true,
      message: `Successfully fetched emails for ${merchant.company_name}`,
      data: {
        merchantId: merchant.id,
        merchantName: merchant.company_name,
        newEmails: result.newEmails,
        newThreads: result.newThreads,
        totalEmails: result.totalEmails
      }
    });
    
  } catch (error) {
    console.error('❌ Fetch emails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emails',
      error: error.message
    });
  }
};

// Get all email threads for a merchant
export const getMerchantThreads = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM email_threads 
       WHERE merchant_id = $1 
       ORDER BY last_activity_at DESC`,
      [merchantId]
    );
    
    res.json({
      success: true,
      threads: result.rows
    });
    
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get email threads'
    });
  }
};

// Get all emails in a specific thread
export const getThreadEmails = async (req, res) => {
  try {
    const { threadId } = req.params;
    
    // Get thread details
    const threadResult = await pool.query(
      'SELECT * FROM email_threads WHERE id = $1',
      [threadId]
    );
    
    if (threadResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Thread not found'
      });
    }
    
    // Get all emails in this thread
    const emailsResult = await pool.query(
      `SELECT * FROM emails 
       WHERE merchant_id = $1 AND thread_id = $2
       ORDER BY email_date ASC`,
      [threadResult.rows[0].merchant_id, threadResult.rows[0].gmail_thread_id]
    );
    
    res.json({
      success: true,
      thread: threadResult.rows[0],
      emails: emailsResult.rows
    });
    
  } catch (error) {
    console.error('Get thread emails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get thread emails'
    });
  }
};

// Get all emails for a merchant
export const getMerchantEmails = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    const result = await pool.query(
      `SELECT * FROM emails 
       WHERE merchant_id = $1 
       ORDER BY email_date DESC 
       LIMIT 100`,
      [merchantId]
    );
    
    res.json({
      success: true,
      emails: result.rows
    });
    
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get emails'
    });
  }
};

// Get recent threads across ALL merchants
export const getRecentThreads = async (req, res) => {
  try {
    const limit = req.query.limit || 10;
    
    const result = await pool.query(
      `SELECT 
        t.*,
        m.company_name as merchant_name
       FROM email_threads t
       JOIN merchants m ON t.merchant_id = m.id
       ORDER BY t.last_activity_at DESC
       LIMIT $1`,
      [limit]
    );
    
    res.json({
      success: true,
      threads: result.rows
    });
    
  } catch (error) {
    console.error('Get recent threads error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent threads'
    });
  }
};

export default {
  fetchEmailsForMerchant,
  getMerchantThreads,
  getThreadEmails,
  getMerchantEmails,
  getRecentThreads
};