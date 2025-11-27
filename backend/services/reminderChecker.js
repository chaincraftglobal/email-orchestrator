import pool from '../config/database.js';

class ReminderChecker {
  constructor() {
    this.checkInterval = null;
    this.lastRunTime = null;
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
      // Prevent running too frequently (minimum 2 minutes between runs)
      const now = new Date();
      if (this.lastRunTime && (now - this.lastRunTime) < 120000) {
        console.log('⏸️ Skipping - ran too recently');
        return;
      }
      this.lastRunTime = now;
      
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
      console.log(`   Admin Email: ${merchant.admin_reminder_email}`);
      console.log(`   Merchant Email: ${merchant.gmail_username}`);
      
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
      
      // Process SELF reminders (max 1 per run to avoid spam)
      for (const thread of selfThreads.rows) {
        if (remindersSent >= 1) break; // Only 1 reminder per check cycle
        
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
      
      // Process VENDOR nudges (max 1 per run to avoid spam)
      for (const thread of vendorThreads.rows) {
        if (remindersSent >= 2) break; // Max 2 total reminders per check cycle
        
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
    // Check if enough time passed since vendor email
    if (minutesSinceInbound < selfReminderTime) {
      return false;
    }
    
    // First reminder
    if (!thread.last_self_reminder_at) {
      return true;
    }
    
    // Subsequent reminders: minimum 6 hour cooldown
    const lastReminder = new Date(thread.last_self_reminder_at);
    const now = new Date();
    const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
    
    // 6 hours = 360 minutes
    if (minutesSinceLastReminder < 360) {
      console.log(`⏸️ Self-reminder cooldown: ${minutesSinceLastReminder}/360 min`);
      return false;
    }
    
    // Max 5 self-reminders per thread
    const reminderCount = thread.self_reminder_sent_count || 0;
    if (reminderCount >= 5) {
      console.log(`🛑 Max self-reminders reached (${reminderCount}/5)`);
      return false;
    }
    
    return true;
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
    
    // Check cooldown (minimum 30 min for testing, 6 hours for production)
    if (thread.last_vendor_reminder_at) {
      const lastReminder = new Date(thread.last_vendor_reminder_at);
      const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
      const cooldownMinutes = merchant.vendor_reminder_time < 60 ? 30 : 360;
      
      if (minutesSinceLastReminder < cooldownMinutes) {
        console.log(`⏸️ Vendor nudge cooldown: ${minutesSinceLastReminder}/${cooldownMinutes} min`);
        return false;
      }
    }
    
    // Max 3 nudges per thread
    const nudgeCount = thread.vendor_reminder_sent_count || 0;
    if (nudgeCount >= 3) {
      console.log(`🛑 Max vendor nudges reached (${nudgeCount}/3)`);
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

  // Get the last email in thread for proper threading (Reply-All)
  async getLastEmailInThread(merchantId, threadId) {
    try {
      const result = await pool.query(
        `SELECT gmail_message_id, from_email, to_emails, cc_emails, subject
         FROM emails 
         WHERE merchant_id = $1 AND thread_id = $2
         ORDER BY email_date DESC 
         LIMIT 1`,
        [merchantId, threadId]
      );
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error('Error getting last email:', error);
      return null;
    }
  }

  // Get all unique recipients from the thread for Reply-All
  async getAllThreadRecipients(merchantId, threadId, merchantEmail, adminEmail) {
    try {
      const result = await pool.query(
        `SELECT DISTINCT from_email, to_emails, cc_emails
         FROM emails 
         WHERE merchant_id = $1 AND thread_id = $2`,
        [merchantId, threadId]
      );
      
      const allRecipients = new Set();
      const allCc = new Set();
      
      const merchantEmailLower = (merchantEmail || '').toLowerCase();
      const adminEmailLower = (adminEmail || '').toLowerCase();
      
      for (const email of result.rows) {
        // Add from_email (but not our own)
        if (email.from_email) {
          const fromLower = email.from_email.toLowerCase();
          if (fromLower !== merchantEmailLower && fromLower !== adminEmailLower) {
            allRecipients.add(email.from_email);
          }
        }
        
        // Add to_emails
        try {
          const toEmails = typeof email.to_emails === 'string' 
            ? JSON.parse(email.to_emails) 
            : email.to_emails;
          
          if (Array.isArray(toEmails)) {
            for (const to of toEmails) {
              const addr = to.address || to;
              const addrLower = (addr || '').toLowerCase();
              if (addrLower && addrLower !== merchantEmailLower && addrLower !== adminEmailLower) {
                allRecipients.add(addr);
              }
            }
          }
        } catch (e) {}
        
        // Add cc_emails
        try {
          const ccEmails = typeof email.cc_emails === 'string' 
            ? JSON.parse(email.cc_emails) 
            : email.cc_emails;
          
          if (Array.isArray(ccEmails)) {
            for (const cc of ccEmails) {
              const addr = cc.address || cc;
              const addrLower = (addr || '').toLowerCase();
              if (addrLower && addrLower !== merchantEmailLower && addrLower !== adminEmailLower) {
                allCc.add(addr);
              }
            }
          }
        } catch (e) {}
      }
      
      return {
        to: Array.from(allRecipients),
        cc: Array.from(allCc)
      };
    } catch (error) {
      console.error('Error getting thread recipients:', error);
      return { to: [], cc: [] };
    }
  }

  async sendSelfReminder(merchant, thread) {
    try {
      // IMPORTANT: Self-reminder goes to ADMIN email, not merchant email!
      const adminEmail = merchant.admin_reminder_email;
      
      if (!adminEmail) {
        console.log('❌ No admin email configured - skipping self-reminder');
        return false;
      }
      
      // Don't send if admin email is same as merchant email
      if (adminEmail.toLowerCase() === merchant.gmail_username.toLowerCase()) {
        console.log('⚠️ Admin email same as merchant email - this would send to yourself!');
        console.log('   Please set a different admin reminder email in merchant settings.');
        return false;
      }
      
      console.log(`📤 Sending self-reminder to ADMIN: ${adminEmail}`);
      
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
      const preview = lastEmail?.snippet || lastEmail?.body_text?.substring(0, 200) || 'No preview available';
      
      const lastInbound = new Date(thread.last_inbound_at);
      const reminderCount = (thread.self_reminder_sent_count || 0) + 1;
      const timeSince = this.formatTimeSince(lastInbound);
      
      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: adminEmail, // ADMIN EMAIL - not merchant email!
        subject: `⚠️ Action Required: Reply Needed - ${thread.subject}`,
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.5; color: #333;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 600;">⚠️ Action Required</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Vendor email awaiting your response</p>
    </div>
    
    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px 20px; margin: 0;">
      <strong style="color: #92400e;">⏰ Reminder #${reminderCount}:</strong> 
      <span style="color: #78350f;">No reply for <strong>${timeSince}</strong></span>
    </div>
    
    <div style="background: #fff; padding: 25px; border: 1px solid #e5e7eb; border-top: none;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; width: 100px;">Subject:</td>
          <td style="padding: 8px 0; font-weight: 600;">${thread.subject}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Vendor:</td>
          <td style="padding: 8px 0;">${thread.vendor_name} &lt;${thread.vendor_email}&gt;</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Gateway:</td>
          <td style="padding: 8px 0;"><span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 14px;">${thread.gateway}</span></td>
        </tr>
      </table>
      
      <div style="margin-top: 20px;">
        <h3 style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280; text-transform: uppercase;">Last Message Preview:</h3>
        <div style="background: #f9fafb; padding: 15px; border-left: 3px solid #3b82f6; border-radius: 0 4px 4px 0; color: #374151;">
          ${preview}
        </div>
      </div>
      
      <div style="margin-top: 25px; text-align: center;">
        <a href="https://mail.google.com/mail/u/0/#search/${encodeURIComponent(thread.subject)}" 
           style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500;">
          📧 Open in Gmail
        </a>
      </div>
    </div>
    
    <div style="background: #f9fafb; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; border: 1px solid #e5e7eb; border-top: none;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af;">
        Email Orchestrator • ${merchant.company_name}
      </p>
    </div>
    
  </div>
</body>
</html>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Self-reminder #${reminderCount} sent to ${adminEmail}`);
      
      return true;
    } catch (error) {
      console.error('❌ Error sending self-reminder:', error.message);
      return false;
    }
  }

  async sendVendorNudge(merchant, thread) {
    try {
      console.log(`📤 Sending vendor nudge as REPLY-ALL...`);
      
      const nodemailer = (await import('nodemailer')).default;
      const OpenAI = (await import('openai')).default;
      
      // Get the last email in thread for proper threading
      const lastEmail = await this.getLastEmailInThread(merchant.id, thread.gmail_thread_id);
      
      // Get all recipients for Reply-All (excluding our own email and admin email)
      const recipients = await this.getAllThreadRecipients(
        merchant.id, 
        thread.gmail_thread_id,
        merchant.gmail_username,
        merchant.admin_reminder_email
      );
      
      // Ensure vendor email is in the TO list
      if (thread.vendor_email && !recipients.to.map(e => e.toLowerCase()).includes(thread.vendor_email.toLowerCase())) {
        recipients.to.unshift(thread.vendor_email);
      }
      
      // If no recipients found, just use vendor email
      if (recipients.to.length === 0) {
        recipients.to = [thread.vendor_email];
      }
      
      console.log(`📧 Reply-All TO: ${recipients.to.join(', ')}`);
      if (recipients.cc.length > 0) {
        console.log(`📧 Reply-All CC: ${recipients.cc.join(', ')}`);
      }
      
      // Check OpenAI key
      if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️ OpenAI not configured - using template');
        return await this.sendVendorNudgeTemplate(merchant, thread, lastEmail, recipients);
      }
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const lastOutbound = new Date(thread.last_outbound_at);
      const timeSince = this.formatTimeSince(lastOutbound);
      const reminderCount = (thread.vendor_reminder_sent_count || 0) + 1;
      
      // Get vendor first name for more personal touch
      const vendorFirstName = (thread.vendor_name || 'Team').split(' ')[0];
      
      console.log(`🤖 Generating professional email via ChatGPT...`);
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are writing a professional business follow-up email for merchant payment gateway onboarding.

CRITICAL RULES:
1. Write ONLY the email body text - absolutely NO "Subject:" line
2. Start directly with greeting like "Hi ${vendorFirstName}," or "Hello ${vendorFirstName},"
3. Keep it 3-4 sentences maximum
4. Sound natural and human, like a real person wrote it
5. Be polite but appropriately urgent for follow-up #${reminderCount}
6. NO emojis anywhere
7. NO mention of "automated" or "system"
8. Use standard professional English

End with EXACTLY this signature format:
Best regards,
Dipak Bhosale
${merchant.company_name}`
          },
          {
            role: "user",
            content: `Write the email body (NO subject line):

To: ${vendorFirstName}
From: Dipak Bhosale, ${merchant.company_name}
Context: Following up on merchant onboarding status
Wait time: ${timeSince} since last communication
This is follow-up: #${reminderCount}

Write a brief professional email requesting a status update.`
          }
        ],
        temperature: 0.7,
        max_tokens: 200
      });
      
      let aiContent = completion.choices[0].message.content.trim();
      
      // Remove any "Subject:" line if AI accidentally included it
      aiContent = aiContent.replace(/^Subject:.*\n/gi, '').trim();
      aiContent = aiContent.replace(/^Re:.*\n/gi, '').trim();
      
      console.log(`✅ ChatGPT generated professional email`);
      
      // Send via Gmail SMTP with proper threading headers
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
      
      // Clean subject (remove multiple Re: prefixes)
      let cleanSubject = thread.subject.replace(/^(Re:\s*)+/gi, '').trim();
      
      // Build professional HTML email with proper styling
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0;">
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #000000;">
${aiContent.split('\n').map(line => {
  if (line.trim() === '') return '<br>';
  return `<div style="margin-bottom: 10px;">${line}</div>`;
}).join('\n')}
  </div>
</body>
</html>`;
      
      // Build mail options with Reply-All and proper threading
      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: recipients.to.join(', '),
        subject: `Re: ${cleanSubject}`,
        text: aiContent,
        html: htmlContent
      };
      
      // Add CC if there are any
      if (recipients.cc.length > 0) {
        mailOptions.cc = recipients.cc.join(', ');
      }
      
      // Add threading headers to chain this email to the existing thread
      if (lastEmail && lastEmail.gmail_message_id) {
        mailOptions.inReplyTo = lastEmail.gmail_message_id;
        mailOptions.references = lastEmail.gmail_message_id;
        console.log(`🔗 Threading: In-Reply-To: ${lastEmail.gmail_message_id}`);
      }
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Vendor nudge #${reminderCount} sent to ${recipients.to.join(', ')}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error sending vendor nudge:', error.message);
      console.log('⚠️ Falling back to template...');
      
      // Get data for template fallback
      const lastEmail = await this.getLastEmailInThread(merchant.id, thread.gmail_thread_id);
      const recipients = await this.getAllThreadRecipients(
        merchant.id, 
        thread.gmail_thread_id,
        merchant.gmail_username,
        merchant.admin_reminder_email
      );
      
      if (thread.vendor_email && !recipients.to.map(e => e.toLowerCase()).includes(thread.vendor_email.toLowerCase())) {
        recipients.to.unshift(thread.vendor_email);
      }
      if (recipients.to.length === 0) {
        recipients.to = [thread.vendor_email];
      }
      
      return await this.sendVendorNudgeTemplate(merchant, thread, lastEmail, recipients);
    }
  }

  async sendVendorNudgeTemplate(merchant, thread, lastEmail, recipients) {
    try {
      console.log(`📤 Sending template vendor nudge as REPLY-ALL...`);
      
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
      const vendorFirstName = (thread.vendor_name || 'Team').split(' ')[0];
      
      // Professional email text - NO subject in body
      const emailText = `Hi ${vendorFirstName},

I hope this email finds you well. I wanted to follow up on the merchant onboarding process for ${merchant.company_name}.

Could you please provide an update on the current status? We are keen to proceed with the integration at the earliest.

Thank you for your assistance.

Best regards,
Dipak Bhosale
${merchant.company_name}`;

      // Professional HTML email - standard formatting
      const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0;">
  <div style="font-family: Arial, Helvetica, sans-serif; font-size: 14px; line-height: 1.6; color: #000000;">
    <div style="margin-bottom: 10px;">Hi ${vendorFirstName},</div>
    <div style="margin-bottom: 10px;">I hope this email finds you well. I wanted to follow up on the merchant onboarding process for ${merchant.company_name}.</div>
    <div style="margin-bottom: 10px;">Could you please provide an update on the current status? We are keen to proceed with the integration at the earliest.</div>
    <div style="margin-bottom: 10px;">Thank you for your assistance.</div>
    <div style="margin-bottom: 0;">Best regards,<br>Dipak Bhosale<br>${merchant.company_name}</div>
  </div>
</body>
</html>`;

      // Clean subject
      let cleanSubject = thread.subject.replace(/^(Re:\s*)+/gi, '').trim();

      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: recipients.to.join(', '),
        subject: `Re: ${cleanSubject}`,
        text: emailText,
        html: emailHtml
      };
      
      // Add CC if there are any
      if (recipients.cc && recipients.cc.length > 0) {
        mailOptions.cc = recipients.cc.join(', ');
      }
      
      // Add threading headers
      if (lastEmail && lastEmail.gmail_message_id) {
        mailOptions.inReplyTo = lastEmail.gmail_message_id;
        mailOptions.references = lastEmail.gmail_message_id;
        console.log(`🔗 Threading: In-Reply-To: ${lastEmail.gmail_message_id}`);
      }
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Template nudge #${reminderCount} sent to ${recipients.to.join(', ')}`);
      
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