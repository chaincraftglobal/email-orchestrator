import pool from '../config/database.js';
import GmailService from '../services/gmailService.js';
import GatewayDetector from '../services/gatewayDetector.js';

// Helper function to check if email should be skipped (reminders, self-sent, etc.)
function shouldSkipEmail(email, merchant) {
  const subject = (email.subject || '').toLowerCase();
  const fromEmail = (email.from?.address || email.from || '').toLowerCase();
  const toEmails = JSON.stringify(email.to || []).toLowerCase();
  
  // Skip reminder emails by subject
  if (subject.includes('reminder') || 
      subject.includes('reply needed') ||
      subject.includes('action required') ||
      subject.includes('email orchestrator')) {
    console.log(`⏭️ PRE-FILTER: Skipping reminder email: "${email.subject?.substring(0, 50)}..."`);
    return true;
  }
  
  // Skip emails with reminder emoji prefixes
  if (subject.startsWith('⚠️') || 
      subject.startsWith('🧪') || 
      subject.startsWith('✅')) {
    console.log(`⏭️ PRE-FILTER: Skipping emoji-prefixed email: "${email.subject?.substring(0, 50)}..."`);
    return true;
  }
  
  // Skip emails sent TO admin reminder email
  const adminEmail = (merchant.admin_reminder_email || '').toLowerCase();
  if (adminEmail && toEmails.includes(adminEmail)) {
    console.log(`⏭️ PRE-FILTER: Skipping email to admin: ${adminEmail}`);
    return true;
  }
  
  // Skip self-sent emails (from merchant to merchant or to admin)
  const merchantEmail = (merchant.gmail_username || '').toLowerCase();
  if (fromEmail === merchantEmail) {
    // Check if it's sent to ourselves or admin
    if (toEmails.includes(merchantEmail) || toEmails.includes(adminEmail)) {
      console.log(`⏭️ PRE-FILTER: Skipping self-sent email`);
      return true;
    }
  }
  
  return false;
}

// Fetch emails for a merchant
export const fetchMerchantEmails = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
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
    
    // Create Gmail service
    const gmailService = new GmailService(
      merchant.gmail_username,
      merchant.gmail_app_password
    );
    
    // Fetch inbox emails
    console.log(`📧 Fetching inbox emails for ${merchant.company_name}...`);
    const inboxEmails = await gmailService.fetchRecentEmails(50);
    
    // Fetch sent emails
    console.log(`📤 Fetching sent emails for ${merchant.company_name}...`);
    const sentEmails = await gmailService.fetchSentEmails(50);
    
    // Process and store emails
    let newEmailsCount = 0;
    let newThreadsCount = 0;
    let skippedCount = 0;
    
    // Process inbox emails (inbound)
    for (const email of inboxEmails) {
      // FIRST: Skip reminder/internal emails
      if (shouldSkipEmail(email, merchant)) {
        skippedCount++;
        continue;
      }
      
      // THEN: Check if it's a gateway email
      const gateway = GatewayDetector.detectGateway(email, merchant.selected_gateways);
      
      if (gateway) {
        const result = await saveEmail(merchant.id, email, 'inbound', gateway);
        if (result.isNew) newEmailsCount++;
        if (result.isNewThread) newThreadsCount++;
      }
    }
    
    // Process sent emails (outbound)
    for (const email of sentEmails) {
      // FIRST: Skip reminder/internal emails
      if (shouldSkipEmail(email, merchant)) {
        skippedCount++;
        continue;
      }
      
      // THEN: Check if it's a gateway email
      const gateway = GatewayDetector.detectGateway(email, merchant.selected_gateways);
      
      if (gateway) {
        const result = await saveEmail(merchant.id, email, 'outbound', gateway);
        if (result.isNew) newEmailsCount++;
      }
    }
    
    // Update last email check time
    await pool.query(
      'UPDATE merchants SET last_email_check = CURRENT_TIMESTAMP WHERE id = $1',
      [merchantId]
    );
    
    console.log(`✅ ${merchant.company_name}: Found ${newEmailsCount} new gateway emails, ${newThreadsCount} new threads, skipped ${skippedCount} internal emails`);
    
    // Return response in format expected by frontend
    res.json({
      success: true,
      message: `Fetched ${inboxEmails.length + sentEmails.length} emails`,
      data: {
        newEmails: newEmailsCount,
        newThreads: newThreadsCount,
        skipped: skippedCount
      },
      totalFetched: inboxEmails.length + sentEmails.length,
      gatewayMatches: newEmailsCount
    });
    
  } catch (error) {
    console.error('Fetch emails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch emails: ' + error.message,
      error: error.message
    });
  }
};

// Helper function to save email to database
async function saveEmail(merchantId, email, direction, gateway) {
  try {
    // Double-check: skip reminder emails
    const subject = (email.subject || '').toLowerCase();
    if (subject.includes('reminder') || 
        subject.includes('action required') ||
        subject.startsWith('⚠️')) {
      console.log(`⏭️ SAVE-FILTER: Skipping reminder: "${email.subject?.substring(0, 50)}..."`);
      return { isNew: false, isNewThread: false };
    }
    
    // Check if email already exists
    const existing = await pool.query(
      'SELECT id FROM emails WHERE gmail_message_id = $1',
      [email.messageId]
    );
    
    if (existing.rows.length > 0) {
      return { isNew: false, isNewThread: false }; // Email already exists
    }
    
    // Extract vendor info
    const vendorEmail = GatewayDetector.extractVendorEmail(email);
    const vendorName = GatewayDetector.extractVendorName(email);
    
    // Insert email
    await pool.query(
      `INSERT INTO emails (
        merchant_id, gmail_message_id, thread_id,
        subject, from_email, from_name, to_emails, cc_emails,
        body_text, body_html, snippet,
        direction, gateway, has_attachments, attachments, email_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        merchantId,
        email.messageId,
        email.threadId,
        email.subject,
        email.from?.address || email.from || '',
        email.from?.name || '',
        JSON.stringify(email.to || []),
        JSON.stringify(email.cc || []),
        email.text || '',
        email.html || '',
        email.text?.substring(0, 200) || '',
        direction,
        gateway,
        (email.attachments?.length || 0) > 0,
        JSON.stringify(email.attachments || []),
        email.date
      ]
    );
    
    // Create or update email thread
    const isNewThread = await createOrUpdateThread(merchantId, email, gateway, direction, vendorEmail, vendorName);
    
    return { isNew: true, isNewThread };
    
  } catch (error) {
    console.error('Save email error:', error);
    return { isNew: false, isNewThread: false };
  }
}

// Helper function to create or update email thread
async function createOrUpdateThread(merchantId, email, gateway, direction, vendorEmail, vendorName) {
  try {
    console.log(`🔍 Thread check: ${email.subject} | Direction: ${direction}`);
    
    // Normalize subject (remove Re:, Fwd:, etc.)
    const normalizeSubject = (subject) => {
      if (!subject) return '';
      return subject
        .replace(/^(Re|RE|re|Fwd|FWD|fwd):\s*/gi, '')
        .trim()
        .toLowerCase();
    };
    
    const normalizedSubject = normalizeSubject(email.subject);
    
    // Check if thread exists by gmail_thread_id OR normalized subject
    const existingThread = await pool.query(
      `SELECT * FROM email_threads 
       WHERE merchant_id = $1 
       AND (
         gmail_thread_id = $2 
         OR LOWER(REGEXP_REPLACE(subject, '^(Re|RE|re|Fwd|FWD|fwd):\\s*', '', 'gi')) = $3
       )
       ORDER BY created_at ASC
       LIMIT 1`,
      [merchantId, email.threadId, normalizedSubject]
    );
    
    if (existingThread.rows.length > 0) {
      console.log(`♻️ Updating existing thread ID: ${existingThread.rows[0].id}`);
      
      const thread = existingThread.rows[0];
      
      // Determine new values
      const lastActor = direction === 'inbound' ? 'vendor' : 'us';
      const lastInbound = direction === 'inbound' ? email.date : thread.last_inbound_at;
      const lastOutbound = direction === 'outbound' ? email.date : thread.last_outbound_at;
      
      // Determine status based on last actor
      let newStatus = thread.status;
      if (lastActor === 'vendor') {
        newStatus = 'waiting_on_us';
      } else if (lastActor === 'us') {
        newStatus = 'waiting_on_vendor';
      }
      
      // Update thread
      await pool.query(
        `UPDATE email_threads SET
          gmail_thread_id = $1,
          subject = $2,
          status = $3,
          last_actor = $4,
          last_inbound_at = $5,
          last_outbound_at = $6,
          last_activity_at = $7,
          vendor_email = COALESCE($8, vendor_email),
          vendor_name = COALESCE($9, vendor_name),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10`,
        [
          email.threadId,
          email.subject?.replace(/^(Re|RE|re|Fwd|FWD|fwd):\s*/gi, '').trim() || thread.subject,
          newStatus,
          lastActor,
          lastInbound,
          lastOutbound,
          email.date,
          vendorEmail || thread.vendor_email,
          vendorName || thread.vendor_name,
          thread.id
        ]
      );
      
      console.log(`✅ Thread updated: status=${newStatus}, last_actor=${lastActor}`);
      return false; // Not a new thread
      
    } else {
      console.log(`✨ Creating new thread: ${email.subject}`);
      
      // Create new thread
      const lastActor = direction === 'inbound' ? 'vendor' : 'us';
      const status = direction === 'inbound' ? 'waiting_on_us' : 'waiting_on_vendor';
      
      const result = await pool.query(
        `INSERT INTO email_threads (
          merchant_id, gmail_thread_id, subject, gateway,
          vendor_email, vendor_name, status, last_actor,
          last_inbound_at, last_outbound_at, last_activity_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          merchantId,
          email.threadId,
          normalizeSubject(email.subject) || email.subject,
          gateway,
          vendorEmail,
          vendorName,
          status,
          lastActor,
          direction === 'inbound' ? email.date : null,
          direction === 'outbound' ? email.date : null,
          email.date
        ]
      );
      
      console.log(`✅ Thread created: ID=${result.rows[0].id}, status=${status}`);
      return true; // New thread created
    }
    
  } catch (error) {
    console.error('Create/update thread error:', error);
    return false;
  }
}

// Get all emails for a merchant
export const getMerchantEmails = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        id, subject, from_email, from_name, snippet,
        direction, gateway, has_attachments, email_date, created_at
      FROM emails 
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
      message: 'Failed to fetch emails'
    });
  }
};

// Get email threads for a merchant
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
      message: 'Failed to fetch threads'
    });
  }
};

// Get single thread with all emails
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
    
    const thread = threadResult.rows[0];
    
    // Get all emails in this thread
    const emailsResult = await pool.query(
      `SELECT * FROM emails 
      WHERE thread_id = $1 
      ORDER BY email_date ASC`,
      [thread.gmail_thread_id]
    );
    
    res.json({
      success: true,
      thread: thread,
      emails: emailsResult.rows
    });
  } catch (error) {
    console.error('Get thread emails error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch thread emails'
    });
  }
};

// Test email reminder (Gmail SMTP)
export const testReminder = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
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
    const nodemailer = (await import('nodemailer')).default;
    
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: merchant.gmail_username,
        pass: merchant.gmail_app_password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    const mailOptions = {
      from: `${merchant.company_name} <${merchant.gmail_username}>`,
      to: merchant.admin_reminder_email,
      subject: '✅ Test Email - Email Orchestrator',
      html: `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0;">✅ Gmail SMTP Working!</h1>
            </div>
            <div style="padding: 30px;">
              <p><strong>Merchant:</strong> ${merchant.company_name}</p>
              <p><strong>Gmail:</strong> ${merchant.gmail_username}</p>
              <p><strong>Admin Email:</strong> ${merchant.admin_reminder_email}</p>
              <p><strong>Status:</strong> ✅ Active</p>
              <p><strong>Time:</strong> ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
            </div>
          </div>
        </body>
        </html>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({
      success: true,
      message: `Test email sent to ${merchant.admin_reminder_email}`
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email: ' + error.message
    });
  }
};