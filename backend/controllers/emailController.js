import pool from '../config/database.js';
import EmailService from '../services/emailService.js';
import reminderChecker from '../services/reminderChecker.js';
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
    
    // Get last inbound email content for preview
    const emailResult = await pool.query(
      `SELECT snippet, body_text, subject 
       FROM emails 
       WHERE merchant_id = $1 
       AND thread_id = $2 
       AND direction = 'inbound'
       ORDER BY email_date DESC 
       LIMIT 1`,
      [merchantId, thread.gmail_thread_id]
    );
    
    const lastEmail = emailResult.rows[0];
    const emailPreview = lastEmail?.snippet || lastEmail?.body_text?.substring(0, 300) || 'No preview available';
    
    // Import SendGrid
    const sgMail = (await import('@sendgrid/mail')).default;
    
    if (!process.env.SENDGRID_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'SendGrid not configured'
      });
    }
    
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    
    // Calculate time since last inbound with better formatting
    const lastInbound = new Date(thread.last_inbound_at);
    const now = new Date();
    const diff = now - lastInbound;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeSince;
    if (days > 0) {
      timeSince = `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      timeSince = `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''} ago`;
    } else {
      timeSince = `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    
    const reminderCount = (thread.self_reminder_sent_count || 0) + 1;
    
    // Email content with improved design
    const subject = `🧪 TEST: Reminder #${reminderCount} - ${thread.subject}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">🧪 TEST EMAIL</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">SendGrid Integration Test - Email Orchestrator</p>
        </div>
        
        <!-- Alert Box -->
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px;">
          <p style="margin: 0; font-size: 16px; color: #92400e;">
            <strong>⏰ This is a TEST:</strong> You haven't replied for <strong>${timeSince}</strong>
          </p>
        </div>
        
        <!-- Thread Details -->
        <div style="padding: 0 20px;">
          <h2 style="color: #1f2937; font-size: 20px; margin-bottom: 15px;">Thread Details</h2>
          <table style="width: 100%; border-collapse: collapse; background-color: #f9fafb;">
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 600; color: #6b7280; width: 140px;">Subject:</td>
              <td style="padding: 12px; color: #1f2937;">${thread.subject}</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 600; color: #6b7280;">Vendor:</td>
              <td style="padding: 12px; color: #1f2937;">${thread.vendor_name} &lt;${thread.vendor_email}&gt;</td>
            </tr>
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 12px; font-weight: 600; color: #6b7280;">Gateway:</td>
              <td style="padding: 12px;">
                <span style="background-color: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600;">
                  ${thread.gateway}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px; font-weight: 600; color: #6b7280;">Last Email:</td>
              <td style="padding: 12px; color: #dc2626; font-weight: 600;">${timeSince}</td>
            </tr>
          </table>
        </div>
        
        <!-- Email Preview -->
        <div style="padding: 0 20px; margin-top: 20px;">
          <h3 style="color: #1f2937; font-size: 18px; margin-bottom: 10px;">📬 Last Message from Vendor:</h3>
          <div style="background-color: #f3f4f6; border-left: 3px solid #3b82f6; padding: 15px; border-radius: 5px; font-size: 14px; color: #374151; line-height: 1.6;">
            ${emailPreview.replace(/\n/g, '<br>')}
          </div>
        </div>
        
        <!-- Quick Action Link -->
        <div style="padding: 30px 20px; text-align: center;">
          <p style="color: #6b7280; margin-bottom: 15px; font-size: 14px;">
            View this email in your Gmail inbox:
          </p>
          <p style="margin: 0;">
            <a href="https://mail.google.com/mail/u/0/#search/${encodeURIComponent(thread.subject)}" 
               style="color: #3b82f6; text-decoration: none; font-weight: 600; font-size: 15px;">
              📧 ${merchant.gmail_username}
            </a>
          </p>
        </div>
        
        <!-- Success Indicator -->
        <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px;">
          <p style="margin: 0; font-size: 13px; color: #065f46;">
            <strong>✅ SUCCESS!</strong> If you're reading this, SendGrid email delivery is working perfectly!
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 10px 10px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 5px 0;"><strong>Email Orchestrator</strong> - Payment Gateway Onboarding Manager</p>
          <p style="margin: 5px 0;">Merchant: ${merchant.company_name}</p>
          <p style="margin: 5px 0;">Admin Email: ${merchant.admin_reminder_email}</p>
          <p style="margin: 15px 0 5px 0; font-size: 11px; color: #9ca3af;">
            This is a TEST email - Sent via SendGrid API
          </p>
        </div>
      </div>
    `;
    
    // Send email via SendGrid
    const msg = {
      to: merchant.admin_reminder_email,
      from: process.env.SENDGRID_FROM_EMAIL || merchant.gmail_username,
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
    console.error('❌ Test email error:', error.message);
    if (error.response?.body?.errors) {
      console.error('SendGrid errors:', JSON.stringify(error.response.body.errors, null, 2));
    }
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message,
      details: error.response?.body || null
    });
  }
};
