import pool from '../config/database.js';

class ReminderChecker {
  constructor() {
    this.checkInterval = null;
    console.log('✅ ReminderChecker initialized');
  }

  // Start the scheduler
  start() {
    console.log('⏰ Starting reminder checker...');
    
    // Run immediately on start
    this.checkAllMerchants();
    
    // Then run every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkAllMerchants();
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('✅ Reminder checker started - running every 5 minutes');
  }

  // Stop the scheduler
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('⏸️ Reminder checker stopped');
    }
  }

  // Check all active merchants
  async checkAllMerchants() {
    try {
      const result = await pool.query(
        'SELECT * FROM merchants WHERE is_active = true'
      );
      
      console.log(`\n⏰ [${new Date().toISOString()}] Checking ${result.rows.length} active merchants...`);
      
      for (const merchant of result.rows) {
        await this.checkThreadsForReminders(merchant);
      }
      
    } catch (error) {
      console.error('Error checking merchants:', error);
    }
  }

  async checkThreadsForReminders(merchant) {
    try {
      console.log(`\n🔔 Checking reminders for ${merchant.company_name}...`);
      
      // Check if within working hours
      if (!this.isWorkingHours()) {
        console.log('⏸️ Outside working hours - skipping');
        return;
      }
      
      // Check threads waiting on US (self-reminders)
      const selfThreads = await pool.query(
        `SELECT * FROM email_threads 
         WHERE merchant_id = $1 
         AND status = 'waiting_on_us'
         ORDER BY last_activity_at ASC`,
        [merchant.id]
      );
      
      console.log(`📋 Found ${selfThreads.rows.length} threads waiting on us`);
      
      // Check threads waiting on VENDOR (vendor nudges)
      const vendorThreads = await pool.query(
        `SELECT * FROM email_threads 
         WHERE merchant_id = $1 
         AND status = 'waiting_on_vendor'
         ORDER BY last_activity_at ASC`,
        [merchant.id]
      );
      
      console.log(`📋 Found ${vendorThreads.rows.length} threads waiting on vendor`);
      
      let remindersSent = 0;
      
      // Process SELF reminders
      for (const thread of selfThreads.rows) {
        if (!thread.last_inbound_at) continue;
        
        const lastInbound = new Date(thread.last_inbound_at);
        const now = new Date();
        const minutesSinceInbound = Math.floor((now - lastInbound) / 60000);
        
        if (this.shouldSendSelfReminder(thread, minutesSinceInbound, merchant.self_reminder_time)) {
          console.log(`⚠️ Thread "${thread.subject}" needs self-reminder (${minutesSinceInbound} min since vendor email)`);
          
          const sent = await this.sendSelfReminder(merchant, thread);
          if (sent) {
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
      
      // Process VENDOR nudges
      for (const thread of vendorThreads.rows) {
        if (await this.shouldSendVendorNudge(merchant, thread)) {
          const lastOutbound = new Date(thread.last_outbound_at);
          const now = new Date();
          const minutesSinceOutbound = Math.floor((now - lastOutbound) / 60000);
          
          console.log(`⚠️ Thread "${thread.subject}" needs vendor nudge (${minutesSinceOutbound} min since our reply)`);
          
          const sent = await this.sendVendorNudge(merchant, thread);
          if (sent) {
            await pool.query(
              `UPDATE email_threads 
               SET is_hot = true, 
                   vendor_reminder_sent_count = COALESCE(vendor_reminder_sent_count, 0) + 1,
                   last_vendor_reminder_at = NOW()
               WHERE id = $1`,
              [thread.id]
            );
            remindersSent++;
          }
        }
      }
      
      if (remindersSent > 0) {
        console.log(`✅ Sent ${remindersSent} reminder(s) for ${merchant.company_name}`);
      } else {
        console.log(`✅ No reminders needed for ${merchant.company_name}`);
      }
      
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  shouldSendSelfReminder(thread, minutesSinceInbound, selfReminderTime) {
    // First reminder: check if enough time passed since vendor email
    if (!thread.last_self_reminder_at) {
      return minutesSinceInbound >= selfReminderTime;
    }
    
    // Subsequent reminders: 6 hour cooldown
    const lastReminder = new Date(thread.last_self_reminder_at);
    const now = new Date();
    const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
    
    return minutesSinceLastReminder >= 360; // 6 hours
  }

  async shouldSendVendorNudge(merchant, thread) {
    if (!thread.last_outbound_at) {
      return false;
    }
    
    const lastOutbound = new Date(thread.last_outbound_at);
    const now = new Date();
    const minutesSinceOutbound = Math.floor((now - lastOutbound) / 60000);
    
    // Check if enough time passed since our last reply
    if (minutesSinceOutbound < merchant.vendor_reminder_time) {
      console.log(`⏳ Thread "${thread.subject}" - ${minutesSinceOutbound}/${merchant.vendor_reminder_time} min elapsed`);
      return false;
    }
    
    // Check cooldown (30 min for testing, 6 hours for production)
    if (thread.last_vendor_reminder_at) {
      const lastReminder = new Date(thread.last_vendor_reminder_at);
      const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
      const cooldownMinutes = merchant.vendor_reminder_time < 60 ? 30 : 360;
      
      if (minutesSinceLastReminder < cooldownMinutes) {
        console.log(`⏸️ Thread "${thread.subject}" - Cooldown: ${minutesSinceLastReminder}/${cooldownMinutes} min`);
        return false;
      }
    }
    
    // Max 3 nudges
    const nudgeCount = thread.vendor_reminder_sent_count || 0;
    if (nudgeCount >= 3) {
      console.log(`🛑 Thread "${thread.subject}" - Max nudges reached (${nudgeCount}/3)`);
      return false;
    }
    
    return true;
  }

  formatTimeSince(date) {
    const now = new Date();
    const diff = now - date;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min`;
    } else {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  }

  async sendSelfReminder(merchant, thread) {
    try {
      console.log(`📤 Sending self-reminder via Gmail SMTP...`);
      
      const nodemailer = (await import('nodemailer')).default;
      
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: merchant.gmail_username,
          pass: merchant.gmail_app_password
        },
        tls: { rejectUnauthorized: false }
      });
      
      // Get last email preview
      const emailResult = await pool.query(
        `SELECT snippet, body_text FROM emails 
         WHERE merchant_id = $1 AND thread_id = $2 AND direction = 'inbound'
         ORDER BY email_date DESC LIMIT 1`,
        [merchant.id, thread.gmail_thread_id]
      );
      
      const lastEmail = emailResult.rows[0];
      const preview = lastEmail?.snippet || lastEmail?.body_text?.substring(0, 200) || 'No preview';
      
      const lastInbound = new Date(thread.last_inbound_at);
      const reminderCount = (thread.self_reminder_sent_count || 0) + 1;
      const timeSince = this.formatTimeSince(lastInbound);
      
      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: merchant.admin_reminder_email,
        subject: `⚠️ Reminder #${reminderCount}: Reply Needed - ${thread.subject}`,
        html: `
          <div style="font-family: Arial; max-width: 600px; margin: 0 auto;">
            <div style="background: #667eea; color: white; padding: 20px; text-align: center;">
              <h1>⚠️ Action Required</h1>
              <p>Vendor Email Awaiting Your Response</p>
            </div>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px;">
              <strong>⏰ Reminder #${reminderCount}:</strong> No reply for <strong>${timeSince}</strong>
            </div>
            <div style="padding: 20px;">
              <p><strong>Subject:</strong> ${thread.subject}</p>
              <p><strong>Vendor:</strong> ${thread.vendor_name} &lt;${thread.vendor_email}&gt;</p>
              <p><strong>Gateway:</strong> ${thread.gateway}</p>
              <h3>Last Message:</h3>
              <div style="background: #f3f4f6; padding: 10px; border-left: 3px solid #3b82f6;">
                ${preview}
              </div>
              <p style="margin-top: 20px;">
                <a href="https://mail.google.com/mail/u/0/#search/${encodeURIComponent(thread.subject)}">
                  📧 Open in Gmail
                </a>
              </p>
            </div>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Self-reminder #${reminderCount} sent to ${merchant.admin_reminder_email}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error sending self-reminder:', error.message);
      return false;
    }
  }

  async sendVendorNudge(merchant, thread) {
    try {
      console.log(`📤 Sending AI-generated vendor nudge...`);
      
      const nodemailer = (await import('nodemailer')).default;
      const OpenAI = (await import('openai')).default;
      
      // Check OpenAI key
      if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️ OpenAI not configured - using template');
        return await this.sendVendorNudgeTemplate(merchant, thread);
      }
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const lastOutbound = new Date(thread.last_outbound_at);
      const timeSince = this.formatTimeSince(lastOutbound);
      const reminderCount = (thread.vendor_reminder_sent_count || 0) + 1;
      
      console.log(`🤖 Generating email via ChatGPT...`);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Write a brief, professional follow-up email for merchant onboarding. 
            
Rules:
- Keep it short (3-4 sentences max)
- Sound natural and human
- Be polite but direct
- Don't use emojis
- Don't mention this is automated
- Sign as "Best regards, Dipak Bhosale, PrintKart India"`
          },
          {
            role: "user",
            content: `Write a follow-up email:

To: ${thread.vendor_name} at ${thread.vendor_email}
From: PrintKart India
Subject: ${thread.subject}
Time since last message: ${timeSince}
Follow-up #${reminderCount}

Request an update on the merchant onboarding status. Keep it brief.`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      });
      
      const aiContent = completion.choices[0].message.content.trim();
      console.log(`✅ ChatGPT generated (${aiContent.length} chars)`);
      
      // Send via Gmail SMTP
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: merchant.gmail_username,
          pass: merchant.gmail_app_password
        },
        connectionTimeout: 60000,
        tls: { rejectUnauthorized: false }
      });
      
      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: thread.vendor_email,
        subject: `Re: ${thread.subject}`,
        text: aiContent,
        html: `<div style="font-family: Arial; line-height: 1.6;">${aiContent.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ AI nudge #${reminderCount} sent to ${thread.vendor_email}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error sending AI nudge:', error.message);
      console.log('⚠️ Falling back to template...');
      return await this.sendVendorNudgeTemplate(merchant, thread);
    }
  }

  async sendVendorNudgeTemplate(merchant, thread) {
    try {
      console.log(`📤 Sending template vendor nudge...`);
      
      const nodemailer = (await import('nodemailer')).default;
      
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: merchant.gmail_username,
          pass: merchant.gmail_app_password
        },
        tls: { rejectUnauthorized: false }
      });
      
      const reminderCount = (thread.vendor_reminder_sent_count || 0) + 1;
      
      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: thread.vendor_email,
        subject: `Re: ${thread.subject}`,
        text: `Hi ${thread.vendor_name},\n\nI hope this email finds you well. I wanted to follow up on our merchant onboarding process for ${merchant.company_name}.\n\nCould you please provide an update on the current status? We're eager to move forward with the integration.\n\nThank you for your assistance.\n\nBest regards,\nDipak Bhosale\nPrintKart India\n${merchant.gmail_username}`,
        html: `<p>Hi ${thread.vendor_name},</p><p>I hope this email finds you well. I wanted to follow up on our merchant onboarding process for ${merchant.company_name}.</p><p>Could you please provide an update on the current status? We're eager to move forward with the integration.</p><p>Thank you for your assistance.</p><p>Best regards,<br>Dipak Bhosale<br>PrintKart India<br>${merchant.gmail_username}</p>`
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Template nudge #${reminderCount} sent to ${thread.vendor_email}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error sending template nudge:', error.message);
      return false;
    }
  }

  isWorkingHours() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const day = istTime.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = istTime.getUTCHours();
    
    // Monday-Saturday, 9 AM - 7 PM IST
    if (day === 0) { // Sunday
      return false;
    }
    
    if (hour < 9 || hour >= 19) {
      return false;
    }
    
    return true;
  }
}

// Export instance
const reminderChecker = new ReminderChecker();
export default reminderChecker;