import pool from '../config/database.js';
import sgMail from '@sendgrid/mail';

class ReminderChecker {
  
  constructor() {
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      console.log('✅ SendGrid initialized');
    } else {
      console.log('⚠️ No SendGrid API key - email reminders disabled');
    }
  }
  
  async checkThreadsForReminders(merchant) {
    try {
      console.log(`\n🔔 Checking reminders for ${merchant.company_name}...`);
      
      // Check threads waiting on US
      const selfThreads = await pool.query(
        `SELECT * FROM email_threads 
         WHERE merchant_id = $1 
         AND status = 'waiting_on_us'
         ORDER BY last_activity_at ASC`,
        [merchant.id]
      );
      
      console.log(`📋 Found ${selfThreads.rows.length} threads waiting on us`);
      
      // Check threads waiting on VENDOR
      const vendorThreads = await pool.query(
        `SELECT * FROM email_threads 
         WHERE merchant_id = $1 
         AND status = 'waiting_on_vendor'
         ORDER BY last_activity_at ASC`,
        [merchant.id]
      );
      
      console.log(`📋 Found ${vendorThreads.rows.length} threads waiting on vendor`);
      
      if (selfThreads.rows.length === 0 && vendorThreads.rows.length === 0) {
        return;
      }
      
      if (!this.isWorkingHours()) {
        console.log('⏸️ Outside working hours - skipping reminders');
        return;
      }
      
      let remindersSent = 0;
      
      // Process SELF reminders
      for (const thread of selfThreads.rows) {
        const lastInbound = new Date(thread.last_inbound_at);
        const now = new Date();
        const minutesSinceInbound = Math.floor((now - lastInbound) / 60000);
        
        const shouldSendReminder = this.shouldSendReminder(
          thread,
          minutesSinceInbound,
          merchant.self_reminder_time
        );
        
        if (shouldSendReminder) {
          console.log(`⚠️ Thread "${thread.subject}" needs self-reminder (${minutesSinceInbound} min since vendor email)`);
          
          const emailSent = await this.sendSelfReminder(merchant, thread);
          
          if (emailSent) {
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
      
      // Process VENDOR reminders
      for (const thread of vendorThreads.rows) {
        const shouldSendNudge = await this.shouldSendVendorNudge(merchant, thread);
        
        if (shouldSendNudge) {
          const lastOutbound = new Date(thread.last_outbound_at);
          const now = new Date();
          const minutesSinceOutbound = Math.floor((now - lastOutbound) / 60000);
          
          console.log(`⚠️ Thread "${thread.subject}" needs vendor nudge (${minutesSinceOutbound} min since our reply)`);
          
          const emailSent = await this.sendVendorNudge(merchant, thread);
          
          if (emailSent) {
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
  
  shouldSendReminder(thread, minutesSinceInbound, selfReminderTime) {
    if (!thread.last_self_reminder_at) {
      return minutesSinceInbound >= selfReminderTime;
    }
    
    const lastReminder = new Date(thread.last_self_reminder_at);
    const now = new Date();
    const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
    
    return minutesSinceLastReminder >= 360; // 6 hours cooldown
  }
  
  async shouldSendVendorNudge(merchant, thread) {
    if (!thread.last_outbound_at) {
      console.log(`⏭️ Thread "${thread.subject}" - No outbound message yet`);
      return false;
    }
    
    const lastOutbound = new Date(thread.last_outbound_at);
    const now = new Date();
    const minutesSinceOutbound = Math.floor((now - lastOutbound) / 60000);
    
    // Check if enough time has passed since our last reply
    if (minutesSinceOutbound < merchant.vendor_reminder_time) {
      console.log(`⏳ Thread "${thread.subject}" - ${minutesSinceOutbound}/${merchant.vendor_reminder_time} min elapsed`);
      return false;
    }
    
    // Check if we already sent a reminder recently (6 hour cooldown)
    if (thread.last_vendor_reminder_at) {
      const lastReminder = new Date(thread.last_vendor_reminder_at);
      const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
      
     // Use 30 min cooldown for testing, 6 hours for production
const cooldownMinutes = merchant.vendor_reminder_time < 60 ? 30 : 360;

if (minutesSinceLastReminder < cooldownMinutes) {
  console.log(`⏸️ Thread "${thread.subject}" - Last reminder sent ${minutesSinceLastReminder} min ago (cooldown: ${cooldownMinutes} min)`);
  return false;
}
    }
    
    // Check max nudges limit (don't spam vendors)
    const nudgeCount = thread.vendor_reminder_sent_count || 0;
    if (nudgeCount >= 3) {
      console.log(`🛑 Thread "${thread.subject}" - Max nudges reached (${nudgeCount}/3)`);
      return false;
    }
    
    return true;
  }
  
  // Format time in human-readable way
  formatTimeSince(date) {
    const now = new Date();
    const diff = now - date;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes} min${minutes !== 1 ? 's' : ''} ago`;
    } else {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
  }
  
  async sendSelfReminder(merchant, thread) {
    try {
      if (!process.env.SENDGRID_API_KEY) {
        console.log('⚠️ SendGrid not configured - skipping email');
        return false;
      }
      
      console.log(`📤 Sending self-reminder via SendGrid...`);
      
      // Get last inbound email content
      const emailResult = await pool.query(
        `SELECT snippet, body_text, subject 
         FROM emails 
         WHERE merchant_id = $1 
         AND thread_id = $2 
         AND direction = 'inbound'
         ORDER BY email_date DESC 
         LIMIT 1`,
        [merchant.id, thread.gmail_thread_id]
      );
      
      const lastEmail = emailResult.rows[0];
      const emailPreview = lastEmail?.snippet || lastEmail?.body_text?.substring(0, 300) || 'No preview available';
      
      const lastInbound = new Date(thread.last_inbound_at);
      const reminderCount = (thread.self_reminder_sent_count || 0) + 1;
      const timeSince = this.formatTimeSince(lastInbound);
      
      const subject = `⚠️ Reminder #${reminderCount}: Reply Needed - ${thread.subject}`;
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0; font-size: 28px;">⚠️ Action Required</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Vendor Email Awaiting Your Response</p>
          </div>
          
          <!-- Alert Box -->
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px;">
            <p style="margin: 0; font-size: 16px; color: #92400e;">
              <strong>⏰ Reminder #${reminderCount}:</strong> You haven't replied to this vendor email for <strong>${timeSince}</strong>
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
              View this email in your Gmail inbox and reply:
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
              <strong>✅ Automated Reminder System Active</strong><br>
              You'll continue to receive reminders every 6 hours until you reply.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; color: #6b7280; font-size: 12px; border-radius: 0 0 10px 10px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 5px 0;"><strong>Email Orchestrator</strong> - Payment Gateway Onboarding Manager</p>
            <p style="margin: 5px 0;">Merchant: ${merchant.company_name}</p>
            <p style="margin: 5px 0;">Admin Email: ${merchant.admin_reminder_email}</p>
            <p style="margin: 5px 0;">Reminder Setting: ${merchant.self_reminder_time} minutes</p>
            <p style="margin: 15px 0 5px 0; font-size: 11px; color: #9ca3af;">
              Total reminders sent for this thread: ${reminderCount}
            </p>
          </div>
        </div>
      `;
      
      const msg = {
        to: merchant.admin_reminder_email,
        from: process.env.SENDGRID_FROM_EMAIL || merchant.gmail_username,
        subject: subject,
        html: html
      };
      
      await sgMail.send(msg);
      
      console.log(`✉️ Sent self-reminder #${reminderCount} to ${merchant.admin_reminder_email} via SendGrid`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error sending self-reminder:', error.message);
      if (error.response?.body?.errors) {
        console.error('SendGrid errors:', JSON.stringify(error.response.body.errors, null, 2));
      }
      return false;
    }
  }
  

async sendVendorNudge(merchant, thread) {
  try {
    console.log(`📤 Sending AI-generated vendor nudge via SendGrid...`);
    
    // Import OpenAI
    const OpenAI = (await import('openai')).default;
    
    // Check if OpenAI API key is configured
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ OpenAI API key not configured - using template instead');
      return await this.sendVendorNudgeTemplate(merchant, thread);
    }
    
    // Check if SendGrid is configured
    if (!process.env.SENDGRID_API_KEY) {
      console.log('⚠️ SendGrid not configured - cannot send email');
      return false;
    }
    
    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Calculate time since last message
    const lastOutbound = new Date(thread.last_outbound_at);
    const timeSince = this.formatTimeSince(lastOutbound);
    const reminderCount = (thread.vendor_reminder_sent_count || 0) + 1;
    
    // Generate email content using ChatGPT
    console.log(`🤖 Generating email content using ChatGPT...`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional business communication assistant. Write a polite, brief, and natural follow-up email for a merchant onboarding process. 

RULES:
- Keep it short (3-4 paragraphs maximum)
- Sound human and natural, NOT robotic
- Be polite but not overly formal
- Don't use fancy formatting or bullet points
- Don't mention this is an automated email
- Don't use emojis
- Keep tone professional but friendly
- Focus on requesting an update on the onboarding status`
        },
        {
          role: "user",
          content: `Write a follow-up email with these details:

Vendor Name: ${thread.vendor_name}
Company: ${merchant.company_name}
Subject: ${thread.subject}
Time since last message: ${timeSince}
Follow-up number: ${reminderCount}

Write a natural follow-up email asking for an update on the merchant onboarding process. Keep it brief and professional.`
        }
      ],
      temperature: 0.7,
      max_tokens: 300
    });
    
    const aiGeneratedContent = completion.choices[0].message.content.trim();
    
    console.log(`✅ ChatGPT generated email content (${aiGeneratedContent.length} chars)`);
    
    // Send via SendGrid (more reliable than Gmail SMTP)
    const msg = {
      to: thread.vendor_email,
      from: process.env.SENDGRID_FROM_EMAIL,
      replyTo: merchant.gmail_username, // Vendor replies go to Gmail!
      subject: `Re: ${thread.subject}`,
      text: aiGeneratedContent,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${aiGeneratedContent.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`
    };
    
    await sgMail.send(msg);
    
    console.log(`✉️ Sent AI-generated vendor nudge #${reminderCount} to ${thread.vendor_email} via SendGrid`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error sending AI vendor nudge:', error.message);
    
    // Fallback to template if ChatGPT fails
    console.log('⚠️ Falling back to template email...');
    return await this.sendVendorNudgeTemplate(merchant, thread);
  }
}

// Fallback template method (if OpenAI fails or not configured)
async sendVendorNudge(merchant, thread) {
  try {
    console.log(`📤 Sending AI-generated vendor nudge via Gmail SMTP...`);
    
    const nodemailer = (await import('nodemailer')).default;
    const OpenAI = (await import('openai')).default;
    
    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ OpenAI not configured');
      return await this.sendVendorNudgeTemplate(merchant, thread);
    }
    
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const lastOutbound = new Date(thread.last_outbound_at);
    const timeSince = this.formatTimeSince(lastOutbound);
    const reminderCount = (thread.vendor_reminder_sent_count || 0) + 1;
    
    console.log(`🤖 Generating email content using ChatGPT...`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Write a brief follow-up email (3-4 paragraphs). Use actual names, no placeholders. Professional tone.`
        },
        {
          role: "user",
          content: `Write follow-up from PrintKart India to ${thread.vendor_name}.
Merchant onboarding, ${timeSince} since last message.

Sign as:
Best regards,
Dipak Bhosale
PrintKart India
${merchant.gmail_username}`
        }
      ],
      temperature: 0.7,
      max_tokens: 250
    });
    
    const aiContent = completion.choices[0].message.content.trim();
    
    console.log(`✅ ChatGPT generated (${aiContent.length} chars)`);
    
    // IMPROVED SMTP Configuration
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,  // SSL port (more reliable)
      secure: true,  // Use SSL
      auth: {
        user: merchant.gmail_username,
        pass: merchant.gmail_app_password
      },
      connectionTimeout: 60000,  // 60 seconds
      greetingTimeout: 30000,
      socketTimeout: 60000,
      tls: {
        rejectUnauthorized: false
      }
    });
    
    let references = '';
    let inReplyTo = '';
    
    if (thread.last_gmail_message_id) {
      inReplyTo = thread.last_gmail_message_id;
      references = thread.message_references 
        ? `${thread.message_references} ${thread.last_gmail_message_id}`
        : thread.last_gmail_message_id;
    }
    
    const mailOptions = {
      from: `${merchant.company_name} <${merchant.gmail_username}>`,
      to: thread.vendor_email,
      subject: `Re: ${thread.subject}`,
      ...(inReplyTo && { inReplyTo: inReplyTo }),
      ...(references && { references: references }),
      text: aiContent,
      html: `<div style="font-family: Arial, sans-serif; line-height: 1.6;">${aiContent.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`
    };
    
    await transporter.sendMail(mailOptions);
    
    console.log(`✉️ Sent AI nudge #${reminderCount} via Gmail SMTP (port 465)`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('⚠️ Falling back to template...');
    return await this.sendVendorNudgeTemplate(merchant, thread);
  }
}
  
  isWorkingHours() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    
    const day = istTime.getUTCDay();
    const hour = istTime.getUTCHours();
    
    console.log(`⏰ Current IST time: ${istTime.toISOString().slice(11, 19)} IST (Day: ${day}, Hour: ${hour})`);
    
    if (day === 0) {
      console.log('⏸️ Today is Sunday - outside working hours');
      return false;
    }
    
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