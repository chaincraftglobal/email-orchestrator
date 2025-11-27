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

  // Check if email should be skipped (reminder/internal email)
  shouldSkipEmail(email, merchant) {
    const subject = (email.subject || '').toLowerCase();
    const fromEmail = (email.from?.address || email.from || '').toLowerCase();
    const toEmailsStr = JSON.stringify(email.to || []).toLowerCase();
    
    // Skip reminder emails sent by our system (check subject patterns)
    if (subject.includes('reminder') || 
        subject.includes('reply needed') ||
        subject.includes('action required') ||
        subject.includes('test') ||
        subject.includes('email orchestrator')) {
      console.log(`⏭️ PRE-FILTER: Skipping reminder email: "${email.subject?.substring(0, 50)}..."`);
      return true;
    }
    
    // Skip if subject starts with special emoji indicators
    if (email.subject && (
        email.subject.startsWith('⚠️') || 
        email.subject.startsWith('🧪') ||
        email.subject.startsWith('✅'))) {
      console.log(`⏭️ PRE-FILTER: Skipping system email (emoji prefix): "${email.subject?.substring(0, 50)}..."`);
      return true;
    }
    
    // Skip emails TO admin reminder email
    const adminEmail = merchant.admin_reminder_email?.toLowerCase();
    if (adminEmail && toEmailsStr.includes(adminEmail)) {
      console.log(`⏭️ PRE-FILTER: Skipping email to admin: ${adminEmail}`);
      return true;
    }
    
    // Skip emails FROM merchant email TO merchant email (self-sent)
    const merchantEmail = merchant.gmail_username?.toLowerCase();
    if (merchantEmail && fromEmail === merchantEmail) {
      // Check if it's to ourselves
      if (toEmailsStr.includes(merchantEmail)) {
        console.log(`⏭️ PRE-FILTER: Skipping self-sent email`);
        return true;
      }
    }
    
    return false;
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
      
      // Process and store new emails
      let newEmailsCount = 0;
      
      // Process inbox (inbound)
      for (const email of inboxEmails) {
        // FIRST: Check if this is a reminder/internal email - skip before detection
        if (this.shouldSkipEmail(email, merchant)) {
          continue;
        }
        
        // THEN: Check if it's a gateway email
        const gateway = GatewayDetector.detectGateway(email, merchant.selected_gateways);
        if (gateway) {
          const saved = await this.saveEmail(merchant, email, 'inbound', gateway);
          if (saved) newEmailsCount++;
        }
      }
      
      // Process sent (outbound)
      for (const email of sentEmails) {
        // FIRST: Check if this is a reminder/internal email - skip before detection
        if (this.shouldSkipEmail(email, merchant)) {
          continue;
        }
        
        // THEN: Check if it's a gateway email
        const gateway = GatewayDetector.detectGateway(email, merchant.selected_gateways);
        if (gateway) {
          const saved = await this.saveEmail(merchant, email, 'outbound', gateway);
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
  async saveEmail(merchant, email, direction, gateway) {
    try {
      // Double-check: Skip reminder emails (backup filter)
      const subject = (email.subject || '').toLowerCase();
      if (subject.includes('reminder') || subject.includes('reply needed')) {
        console.log(`⏭️ SAVE-FILTER: Skipping reminder: "${email.subject?.substring(0, 40)}..."`);
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
          merchant.id,
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
      
      // Update or create thread
      await this.updateThread(merchant.id, email, gateway, direction);
      
      return true; // New email saved
    } catch (error) {
      console.error('Error saving email:', error);
      return false;
    }
  }

  // Update thread status
  async updateThread(merchantId, email, gateway, direction) {
    try {
      const vendorEmail = email.from.address || '';
      const vendorName = email.from.name || email.from.address || 'Unknown';
      
      // Check if thread exists
      const existing = await pool.query(
        'SELECT * FROM email_threads WHERE merchant_id = $1 AND gmail_thread_id = $2',
        [merchantId, email.threadId]
      );
      
      if (existing.rows.length > 0) {
        // Update existing thread
        const thread = existing.rows[0];
        const lastActor = direction === 'inbound' ? 'vendor' : 'us';
        const status = direction === 'inbound' ? 'waiting_on_us' : 'waiting_on_vendor';
        
        // If we replied, clear hot flag
        const isHot = direction === 'outbound' ? false : thread.is_hot;
        
        await pool.query(
          `UPDATE email_threads SET
            last_actor = $1,
            status = $2,
            is_hot = $3,
            last_inbound_at = $4,
            last_outbound_at = $5,
            last_activity_at = $6,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $7`,
          [
            lastActor,
            status,
            isHot,
            direction === 'inbound' ? email.date : thread.last_inbound_at,
            direction === 'outbound' ? email.date : thread.last_outbound_at,
            email.date,
            thread.id
          ]
        );
      } else {
        // Create new thread
        const lastActor = direction === 'inbound' ? 'vendor' : 'us';
        const status = direction === 'inbound' ? 'waiting_on_us' : 'waiting_on_vendor';
        
        await pool.query(
          `INSERT INTO email_threads (
            merchant_id, gmail_thread_id, subject, gateway,
            vendor_email, vendor_name, status, last_actor,
            last_inbound_at, last_outbound_at, last_activity_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            merchantId,
            email.threadId,
            email.subject,
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