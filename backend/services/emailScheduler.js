import cron from 'node-cron';
import pool from '../config/database.js';
import GmailService from './gmailService.js';
import GatewayDetector from './gatewayDetector.js';
import reminderChecker from './reminderChecker.js';

class EmailScheduler {
  constructor() {
    this.jobs = new Map(); // Store active cron jobs
    this.isRunning = false;
  }

  // Start scheduler for all active merchants
  async startAll() {
    try {
      console.log('🔄 Starting email scheduler for all merchants...');
      
      // Get all active merchants
      const result = await pool.query(
        'SELECT * FROM merchants WHERE is_active = true'
      );
      
      const merchants = result.rows;
      console.log(`📋 Found ${merchants.length} active merchants`);
      
      // Start a job for each merchant
      for (const merchant of merchants) {
        await this.startForMerchant(merchant);
      }
      
      this.isRunning = true;
      console.log('✅ Email scheduler started for all merchants');
    } catch (error) {
      console.error('❌ Error starting scheduler:', error);
    }
  }

  // Start scheduler for a specific merchant
  async startForMerchant(merchant) {
    try {
      // Stop existing job if any
      this.stopForMerchant(merchant.id);
      
      // Convert frequency from minutes to cron expression
      const cronExpression = this.frequencyToCron(merchant.email_check_frequency);
      
      console.log(`⏰ Scheduling merchant ${merchant.company_name} (every ${merchant.email_check_frequency} min)`);
      
      // Create cron job
      const job = cron.schedule(cronExpression, async () => {
        await this.checkEmailsForMerchant(merchant);
      });
      
      // Store job
      this.jobs.set(merchant.id, {
        job,
        merchant,
        lastRun: null,
        nextRun: this.getNextRunTime(cronExpression)
      });
      
      console.log(`✅ Scheduled job for ${merchant.company_name}`);
    } catch (error) {
      console.error(`❌ Error scheduling merchant ${merchant.id}:`, error);
    }
  }

  // Stop scheduler for a specific merchant
  stopForMerchant(merchantId) {
    const jobData = this.jobs.get(merchantId);
    if (jobData) {
      jobData.job.stop();
      this.jobs.delete(merchantId);
      console.log(`🛑 Stopped scheduler for merchant ${merchantId}`);
    }
  }

  // Stop all schedulers
  stopAll() {
    console.log('🛑 Stopping all schedulers...');
    for (const [merchantId, jobData] of this.jobs) {
      jobData.job.stop();
    }
    this.jobs.clear();
    this.isRunning = false;
    console.log('✅ All schedulers stopped');
  }

  // Normalize subject - remove Re:, Fwd:, etc. for matching
  normalizeSubject(subject) {
    if (!subject) return '';
    return subject
      .replace(/^(Re|RE|re|Fwd|FWD|fwd|Fw|FW|fw):\s*/gi, '')
      .replace(/^(Re|RE|re|Fwd|FWD|fwd|Fw|FW|fw):\s*/gi, '') // Run twice for "Re: Re:"
      .trim()
      .toLowerCase();
  }

  // Check emails for a merchant (main worker function)
  async checkEmailsForMerchant(merchant) {
    try {
      console.log(`\n📧 Checking emails for ${merchant.company_name}...`);
      
      // Update last run time
      const jobData = this.jobs.get(merchant.id);
      if (jobData) {
        jobData.lastRun = new Date();
      }
      
      // Create Gmail service
      const gmailService = new GmailService(
        merchant.gmail_username,
        merchant.gmail_app_password
      );
      
      // Fetch inbox emails
      const inboxEmails = await gmailService.fetchRecentEmails(20);
      console.log(`📥 Fetched ${inboxEmails.length} inbox emails`);
      
      // Fetch sent emails
      const sentEmails = await gmailService.fetchSentEmails(20);
      console.log(`📤 Fetched ${sentEmails.length} sent emails`);
      
      // Get existing threads for this merchant (for thread matching)
      const existingThreads = await pool.query(
        'SELECT id, gmail_thread_id, subject, gateway, vendor_email FROM email_threads WHERE merchant_id = $1',
        [merchant.id]
      );
      
      // Build maps for quick lookup
      const threadByGmailId = new Map();
      const threadBySubject = new Map();
      
      for (const t of existingThreads.rows) {
        threadByGmailId.set(t.gmail_thread_id, t);
        const normalizedSubject = this.normalizeSubject(t.subject);
        if (normalizedSubject) {
          threadBySubject.set(normalizedSubject, t);
        }
      }
      
      // Process and store new emails
      let newEmailsCount = 0;
      
      // Process inbox (inbound)
      for (const email of inboxEmails) {
        const gateway = GatewayDetector.detectGateway(email, merchant.selected_gateways);
        if (gateway) {
          const saved = await this.saveEmail(merchant.id, email, 'inbound', gateway, threadByGmailId, threadBySubject);
          if (saved) newEmailsCount++;
        }
      }
      
      // Process sent (outbound) - match by thread_id OR normalized subject
      for (const email of sentEmails) {
        // First check by Gmail thread ID
        let matchedThread = threadByGmailId.get(email.threadId);
        
        // If not found, check by normalized subject
        if (!matchedThread) {
          const normalizedSubject = this.normalizeSubject(email.subject);
          matchedThread = threadBySubject.get(normalizedSubject);
        }
        
        if (matchedThread) {
          console.log(`🔍 Outbound email matches thread: "${email.subject}" → ${matchedThread.gateway}`);
          const saved = await this.saveEmail(merchant.id, email, 'outbound', matchedThread.gateway, threadByGmailId, threadBySubject);
          if (saved) newEmailsCount++;
        }
      }
      
      // Update last check time
      await pool.query(
        'UPDATE merchants SET last_email_check = CURRENT_TIMESTAMP WHERE id = $1',
        [merchant.id]
      );
      
      console.log(`✅ ${merchant.company_name}: Found ${newEmailsCount} new gateway emails`);
      
      // Check for threads that need reminders
      await reminderChecker.checkThreadsForReminders(merchant);
      
    } catch (error) {
      console.error(`❌ Error checking emails for merchant ${merchant.id}:`, error.message);
    }
  }

  // Save email to database (returns true if new, false if duplicate)
  async saveEmail(merchantId, email, direction, gateway, threadByGmailId, threadBySubject) {
    try {
      // SKIP reminder emails and internal emails
      const subject = (email.subject || '').toLowerCase();
      const fromEmail = (email.from?.address || email.from || '').toLowerCase();
      const toEmails = JSON.stringify(email.to || []).toLowerCase();
      
      // Don't save reminder emails sent by our system
      if (subject.includes('reminder') || 
          subject.includes('🧪 test') || 
          subject.includes('⚠️') ||
          subject.includes('email orchestrator') ||
          subject.includes('action required') ||
          subject.includes('[warning]') ||
          subject.includes('[critical]')) {
        console.log(`⏭️ Skipping system email: "${email.subject}"`);
        return false;
      }
      
      // Don't save emails sent TO admin reminder email (internal communications)
      if (toEmails.includes('lacewingtech') || toEmails.includes('admin_reminder')) {
        console.log(`⏭️ Skipping internal email to admin`);
        return false;
      }
      
      // Check if email already exists
      const existing = await pool.query(
        'SELECT id FROM emails WHERE gmail_message_id = $1',
        [email.messageId]
      );
      
      if (existing.rows.length > 0) {
        return false; // Already exists
      }
      
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
          email.from.address || '',
          email.from.name || '',
          JSON.stringify(email.to),
          JSON.stringify(email.cc),
          email.text,
          email.html,
          email.text?.substring(0, 200) || '',
          direction,
          gateway,
          email.attachments.length > 0,
          JSON.stringify(email.attachments),
          email.date
        ]
      );
      
      // Update or create thread (with deduplication)
      await this.updateThread(merchantId, email, gateway, direction, threadByGmailId, threadBySubject);
      
      return true; // New email saved
    } catch (error) {
      console.error('Error saving email:', error);
      return false;
    }
  }

  // Update thread status - WITH DEDUPLICATION BY NORMALIZED SUBJECT
  async updateThread(merchantId, email, gateway, direction, threadByGmailId, threadBySubject) {
    try {
      const vendorEmail = email.from.address || '';
      const vendorName = email.from.name || email.from.address || 'Unknown';
      const normalizedSubject = this.normalizeSubject(email.subject);
      
      // First: Check if thread exists by Gmail thread ID
      let existingThread = threadByGmailId.get(email.threadId);
      
      // Second: If not found, check by normalized subject (to prevent duplicates)
      if (!existingThread && normalizedSubject) {
        existingThread = threadBySubject.get(normalizedSubject);
        
        if (existingThread) {
          console.log(`🔗 Found existing thread by subject match: "${normalizedSubject}"`);
          // Update the Gmail thread ID to link them
          await pool.query(
            'UPDATE email_threads SET gmail_thread_id = $1 WHERE id = $2',
            [email.threadId, existingThread.id]
          );
        }
      }
      
      if (existingThread) {
        // Update existing thread
        const lastActor = direction === 'inbound' ? 'vendor' : 'us';
        const status = direction === 'inbound' ? 'waiting_on_us' : 'waiting_on_vendor';
        
        // If we replied, clear hot flag and reset vendor reminder tracking
        const updates = direction === 'outbound' 
          ? {
              is_hot: false,
              vendor_reminder_sent_count: 0,  // Reset vendor reminders when we reply
              last_vendor_reminder_at: null
            }
          : {
              self_reminder_sent_count: 0,  // Reset self reminders when vendor replies
              last_self_reminder_at: null
            };
        
        console.log(`🔄 Updating thread ID ${existingThread.id}: status=${status}, last_actor=${lastActor}`);
        
        await pool.query(
          `UPDATE email_threads SET
            last_actor = $1,
            status = $2,
            is_hot = $3,
            last_inbound_at = $4,
            last_outbound_at = $5,
            last_activity_at = $6,
            self_reminder_sent_count = COALESCE($7, self_reminder_sent_count),
            last_self_reminder_at = $8,
            vendor_reminder_sent_count = COALESCE($9, vendor_reminder_sent_count),
            last_vendor_reminder_at = $10,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $11`,
          [
            lastActor,
            status,
            direction === 'outbound' ? false : existingThread.is_hot,
            direction === 'inbound' ? email.date : existingThread.last_inbound_at,
            direction === 'outbound' ? email.date : existingThread.last_outbound_at,
            email.date,
            direction === 'inbound' ? 0 : null,
            direction === 'inbound' ? null : undefined,
            direction === 'outbound' ? 0 : null,
            direction === 'outbound' ? null : undefined,
            existingThread.id
          ]
        );
        
        console.log(`✅ Thread updated: "${existingThread.subject}" → ${status}`);
      } else {
        // Create new thread
        const lastActor = direction === 'inbound' ? 'vendor' : 'us';
        const status = direction === 'inbound' ? 'waiting_on_us' : 'waiting_on_vendor';
        
        // For outbound emails, get vendor info from TO field
        let finalVendorEmail = vendorEmail;
        let finalVendorName = vendorName;
        
        if (direction === 'outbound' && email.to && email.to.length > 0) {
          finalVendorEmail = email.to[0].address || email.to[0];
          finalVendorName = email.to[0].name || finalVendorEmail;
        }
        
        // Store normalized subject for future matching
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
            email.subject.replace(/^(Re|RE|re|Fwd|FWD|fwd|Fw|FW|fw):\s*/gi, '').trim(), // Store clean subject
            gateway,
            finalVendorEmail,
            finalVendorName,
            status,
            lastActor,
            direction === 'inbound' ? email.date : null,
            direction === 'outbound' ? email.date : null,
            email.date
          ]
        );
        
        console.log(`✨ New thread created: ID=${result.rows[0].id}, "${email.subject}" → ${status}`);
        
        // Add to maps for future matching in this session
        const newThread = {
          id: result.rows[0].id,
          gmail_thread_id: email.threadId,
          subject: email.subject,
          gateway: gateway,
          vendor_email: finalVendorEmail
        };
        threadByGmailId.set(email.threadId, newThread);
        if (normalizedSubject) {
          threadBySubject.set(normalizedSubject, newThread);
        }
      }
    } catch (error) {
      console.error('Error updating thread:', error);
    }
  }

  // Convert frequency (minutes) to cron expression
  frequencyToCron(minutes) {
    if (minutes < 60) {
      // Every X minutes
      return `*/${minutes} * * * *`;
    } else {
      // Every X hours
      const hours = minutes / 60;
      return `0 */${hours} * * *`;
    }
  }

  // Get next run time (approximate)
  getNextRunTime(cronExpression) {
    const now = new Date();
    // Simple approximation - just add the interval
    return new Date(now.getTime() + 60000); // Next minute for now
  }

  // Get status of all jobs
  getStatus() {
    const jobs = [];
    for (const [merchantId, jobData] of this.jobs) {
      jobs.push({
        merchantId,
        companyName: jobData.merchant.company_name,
        frequency: jobData.merchant.email_check_frequency,
        lastRun: jobData.lastRun,
        nextRun: jobData.nextRun,
        isActive: true
      });
    }
    
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      jobs
    };
  }
}

// Create singleton instance
const emailScheduler = new EmailScheduler();

export default emailScheduler;