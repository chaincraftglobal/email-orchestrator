import pool from '../config/database.js';
import nodemailer from 'nodemailer';

class ReminderChecker {
  
  // Check all threads for a merchant and send reminders if needed
  async checkThreadsForReminders(merchant) {
    try {
      console.log(`\n🔔 Checking reminders for ${merchant.company_name}...`);
      
      // Get all active threads waiting on us
      const result = await pool.query(
        `SELECT * FROM email_threads 
         WHERE merchant_id = $1 
         AND status = 'waiting_on_us'
         ORDER BY last_activity_at ASC`,
        [merchant.id]
      );
      
      const threads = result.rows;
      console.log(`📋 Found ${threads.length} threads waiting on us`);
      
      if (threads.length === 0) {
        return;
      }
      
      // Check working hours (Mon-Sat 9 AM - 7 PM IST)
      if (!this.isWorkingHours()) {
        console.log('⏸️ Outside working hours - skipping reminders');
        return;
      }
      
      let remindersSent = 0;
      
      for (const thread of threads) {
        // Calculate time since last inbound email
        const lastInbound = new Date(thread.last_inbound_at);
        const now = new Date();
        const minutesSinceInbound = Math.floor((now - lastInbound) / 60000);
        
        // First reminder: after self_reminder_time (e.g., 30 min)
        // Subsequent reminders: every 6 hours
        const shouldSendReminder = this.shouldSendReminder(
          thread,
          minutesSinceInbound,
          merchant.self_reminder_time
        );
        
        if (shouldSendReminder) {
          console.log(`⚠️ Thread "${thread.subject}" needs reminder (${minutesSinceInbound} min since vendor email)`);
          
          // Send reminder email
          const emailSent = await this.sendSelfReminder(merchant, thread);
          
          if (emailSent) {
            // Mark thread as hot and update reminder count
            await pool.query(
              `UPDATE email_threads 
               SET is_hot = true, 
                   self_reminder_sent_count = COALESCE(self_reminder_sent_count, 0) + 1,
                   last_self_reminder_at = NOW()
               WHERE id = $1`,
              [thread.id]
            );
            
            remindersSent++;
          }
        }
      }
      
      if (remindersSent > 0) {
        console.log(`✅ Sent ${remindersSent} self-reminder(s) for ${merchant.company_name}`);
      } else {
        console.log(`✅ No reminders needed for ${merchant.company_name}`);
      }
      
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }
  
  // Determine if reminder should be sent
  shouldSendReminder(thread, minutesSinceInbound, selfReminderTime) {
    // First reminder: after selfReminderTime (e.g., 30 min)
    if (!thread.last_self_reminder_at) {
      return minutesSinceInbound >= selfReminderTime;
    }
    
    // Subsequent reminders: every 6 hours (360 min)
    const lastReminder = new Date(thread.last_self_reminder_at);
    const now = new Date();
    const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
    
    // Send reminder every 6 hours
    return minutesSinceLastReminder >= 360;
  }
  
  // Send self-reminder email to admin
  async sendSelfReminder(merchant, thread) {
    try {
      console.log(`📤 Attempting to send reminder email...`);
      
      // Create email transporter with timeout and fallback settings
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // Use STARTTLS
        auth: {
          user: merchant.gmail_username,
          pass: merchant.gmail_app_password
        },
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 30000,
        socketTimeout: 30000,
        logger: true, // Enable logging
        debug: false // Disable debug for cleaner logs
      });
      
      // Calculate time since last inbound
      const lastInbound = new Date(thread.last_inbound_at);
      const now = new Date();
      const hoursSinceInbound = Math.floor((now - lastInbound) / 3600000);
      
      const reminderCount = (thread.self_reminder_sent_count || 0) + 1;
      
      // Email content
      const subject = `⚠️ Reminder #${reminderCount}: Reply Pending - ${thread.subject}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">⚠️ Self-Reminder: Reply Needed</h2>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Reminder #${reminderCount}: You haven't replied to this vendor email yet!</strong></p>
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
          
          <p style="color: #666; font-size: 14px;">
            This is an automated reminder from Email Orchestrator.<br>
            Merchant: ${merchant.company_name}<br>
            Reminder setting: ${merchant.self_reminder_time} minutes<br>
            Total reminders sent: ${reminderCount}
          </p>
        </div>
      `;
      
      // Send email
      const info = await transporter.sendMail({
        from: `"Email Orchestrator" <${merchant.gmail_username}>`,
        to: merchant.admin_reminder_email,
        subject: subject,
        html: html
      });
      
      console.log(`✉️ Sent self-reminder #${reminderCount} to ${merchant.admin_reminder_email}`);
      console.log(`📧 Message ID: ${info.messageId}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error sending self-reminder:', error.message);
      
      // Log specific error details
      if (error.code === 'ETIMEDOUT') {
        console.error('⚠️ SMTP connection timeout - Railway may be blocking Gmail SMTP');
      } else if (error.code === 'EAUTH') {
        console.error('⚠️ Gmail authentication failed - check app password');
      }
      
      return false;
    }
  }
  
  // Check if current time is within working hours (Mon-Sat 9 AM - 7 PM IST)
  isWorkingHours() {
    const now = new Date();
    
    // Convert to IST (UTC +5:30)
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const day = istTime.getUTCDay();
    const hour = istTime.getUTCHours();
    
    console.log(`⏰ Current IST time: ${istTime.toISOString().slice(11, 19)} IST (Day: ${day}, Hour: ${hour})`);
    
    // Check if Sunday
    if (day === 0) {
      console.log('⏸️ Today is Sunday - outside working hours');
      return false;
    }
    
    // Check if within 9 AM - 7 PM IST
    if (hour < 9 || hour >= 19) {
      console.log(`⏸️ Hour ${hour} is outside 9 AM - 7 PM IST`);
      return false;
    }
    
    console.log('✅ Within working hours');
    return true;
  }
}

const reminderChecker = new ReminderChecker();

export default reminderChecker;
