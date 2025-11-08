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
// Test reminder email (bypasses working hours)
export const testReminderEmail = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    console.log(`🧪 Manual reminder test for merchant ID: ${merchantId}`);
    
    // Get merchant
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
    
    // Get a thread waiting on us
    const threadResult = await pool.query(
      `SELECT * FROM email_threads 
       WHERE merchant_id = $1 
       AND status = 'waiting_on_us'
       ORDER BY last_activity_at DESC
       LIMIT 1`,
      [merchantId]
    );
    
    if (threadResult.rows.length === 0) {
      return res.json({
        success: false,
        message: 'No threads waiting on us to test with'
      });
    }
    
    const thread = threadResult.rows[0];
    
    // Import SendGrid
    const sgMail = (await import('@sendgrid/mail')).default;
    
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'SendGrid not configured'
      });
    }
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    // Calculate time since last inbound
    const lastInbound = new Date(thread.last_inbound_at);
    const now = new Date();
    const hoursSinceInbound = Math.floor((now - lastInbound) / 3600000);
    
    const reminderCount = (thread.self_reminder_sent_count || 0) + 1;
    
    // Email content
    const subject = `🧪 TEST: Reminder #${reminderCount} - ${thread.subject}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #3b82f6; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">🧪 TEST EMAIL</h1>
          <p style="margin: 5px 0 0 0;">Email Orchestrator - SendGrid Test</p>
        </div>
        
        <h2 style="color: #f59e0b;">⚠️ Self-Reminder: Reply Needed</h2>
        
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>This is a TEST reminder - SendGrid is working! 🎉</strong></p>
        </div>
        
        <h3>Thread Details:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Subject:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${thread.subject}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Vendor:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${thread.vendor_name} &lt;${thread.vendor_email}&gt;</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Gateway:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${thread.gateway}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Last Vendor Email:</strong></td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${lastInbound.toLocaleString()} (${hoursSinceInbound} hours ago)</td>
          </tr>
        </table>
        
        <div style="margin: 30px 0;">
          <a href="https://mail.google.com" 
             style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
            📧 Open Gmail and Reply
          </a>
        </div>
        
        <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>✅ SUCCESS!</strong> If you're reading this, SendGrid email delivery is working perfectly!</p>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          This is a TEST email from Email Orchestrator.<br>
          Merchant: ${merchant.company_name}<br>
          Admin Email: ${merchant.admin_reminder_email}<br>
          Sent via SendGrid API
        </p>
      </div>
    `;
    
    // Send email via SendGrid
    const msg = {
      to: merchant.admin_reminder_email,
      from: process.env.SENDGRID_FROM_EMAIL || 'dipak.lacewingtech@gmail.com',
      subject: subject,
      html: html
    };
    
    await sgMail.send(msg);
    
    console.log(`✉️ TEST email sent to ${merchant.admin_reminder_email}`);
    
    res.json({
      success: true,
      message: `Test reminder email sent to ${merchant.admin_reminder_email}`,
      data: {
        merchant: merchant.company_name,
        to: merchant.admin_reminder_email,
        thread: thread.subject
      }
    });
    
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
      details: error.response?.body || null
    });
  }
};
