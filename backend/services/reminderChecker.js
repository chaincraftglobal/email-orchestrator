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
         AND is_hot = false
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
        
        // Check if self-reminder time has passed
        if (minutesSinceInbound >= merchant.self_reminder_time) {
          console.log(`⚠️ Thread "${thread.subject}" needs reminder (${minutesSinceInbound} min since vendor email)`);
          
          // Send reminder email
          await this.sendSelfReminder(merchant, thread);
          
          // Mark thread as hot
          await pool.query(
            'UPDATE email_threads SET is_hot = true WHERE id = $1',
            [thread.id]
          );
          
          remindersSent++;
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
  
  // Send self-reminder email to admin
  async sendSelfReminder(merchant, thread) {
    try {
      // Create email transporter (using Gmail SMTP)
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: merchant.gmail_username,
          pass: merchant.gmail_app_password
        }
      });
      
      // Calculate time since last inbound
      const lastInbound = new Date(thread.last_inbound_at);
      const now = new Date();
      const hoursSinceInbound = Math.floor((now - lastInbound) / 3600000);
      
      // Email content
      const subject = `⚠️ Reminder: Reply Pending - ${thread.subject}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #f59e0b;">⚠️ Self-Reminder: Reply Needed</h2>
          
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
            <p style="margin: 0;"><strong>You haven't replied to this vendor email yet!</strong></p>
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
            Reminder setting: ${merchant.self_reminder_time} minutes
          </p>
        </div>
      `;
      
      // Send email
      await transporter.sendMail({
        from: `"Email Orchestrator" <${merchant.gmail_username}>`,
        to: merchant.admin_reminder_email,
        subject: subject,
        html: html
      });
      
      console.log(`✉️ Sent self-reminder to ${merchant.admin_reminder_email}`);
      
    } catch (error) {
      console.error('Error sending self-reminder:', error);
    }
  }
  
  // Check if current time is within working hours (Mon-Sat 9 AM - 7 PM IST)
  isWorkingHours() {
    const now = new Date();
    
    // Convert to IST (UTC +5:30)
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds
    const istTime = new Date(now.getTime() + istOffset);
    
    const day = istTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = istTime.getUTCHours();
    
    // Check if Sunday (day 0)
    if (day === 0) {
      return false;
    }
    
    // Check if within 9 AM - 7 PM IST
    if (hour < 9 || hour >= 19) {
      return false;
    }
    
    return true;
  }
}

const reminderChecker = new ReminderChecker();

export default reminderChecker;