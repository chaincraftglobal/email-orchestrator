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
      console.log(`   Admin Email: ${merchant.admin_reminder_email}`);
      console.log(`   Merchant Email: ${merchant.gmail_username}`);
      console.log(`   Self Reminder Time: ${merchant.self_reminder_time} minutes`);
      console.log(`   Vendor Reminder Time: ${merchant.vendor_reminder_time} minutes`);
      
      // Check if within working hours
      if (!this.isWorkingHours()) {
        console.log('⏸️ Outside working hours - skipping');
        return;
      }
      
      console.log('✅ Within working hours');
      
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
        console.log(`\n   📧 Checking thread: "${thread.subject}"`);
        console.log(`      Status: ${thread.status}`);
        console.log(`      Last Inbound: ${thread.last_inbound_at}`);
        console.log(`      Last Self Reminder: ${thread.last_self_reminder_at}`);
        console.log(`      Self Reminder Count: ${thread.self_reminder_sent_count || 0}`);
        
        if (!thread.last_inbound_at) {
          console.log(`      ⏭️ SKIP: No last_inbound_at timestamp`);
          continue;
        }
        
        const lastInbound = new Date(thread.last_inbound_at);
        const now = new Date();
        const minutesSinceInbound = Math.floor((now - lastInbound) / 60000);
        
        console.log(`      ⏱️ Minutes since inbound: ${minutesSinceInbound}`);
        console.log(`      ⏱️ Required minutes: ${merchant.self_reminder_time}`);
        
        const shouldSend = this.shouldSendSelfReminder(thread, minutesSinceInbound, merchant.self_reminder_time);
        console.log(`      📊 Should send reminder: ${shouldSend}`);
        
        if (shouldSend) {
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
      
      // Process VENDOR nudges - with deduplication
      // First, group threads by vendor email to prevent duplicate nudges
      const vendorThreadGroups = new Map();
      for (const thread of vendorThreads.rows) {
        const vendorEmail = (thread.vendor_email || '').toLowerCase();
        if (!vendorThreadGroups.has(vendorEmail)) {
          vendorThreadGroups.set(vendorEmail, []);
        }
        vendorThreadGroups.get(vendorEmail).push(thread);
      }
      
      // Track which vendors we've already nudged this cycle
      const nudgedVendors = new Set();
      
      for (const thread of vendorThreads.rows) {
        console.log(`\n   📧 Checking vendor thread: "${thread.subject}"`);
        console.log(`      Status: ${thread.status}`);
        console.log(`      Last Outbound: ${thread.last_outbound_at}`);
        console.log(`      Last Vendor Reminder: ${thread.last_vendor_reminder_at}`);
        console.log(`      Vendor Reminder Count: ${thread.vendor_reminder_sent_count || 0}`);
        
        const vendorEmail = (thread.vendor_email || '').toLowerCase();
        
        // Check if we've already nudged this vendor in this cycle
        if (nudgedVendors.has(vendorEmail)) {
          console.log(`      ⏭️ SKIP: Already nudged ${vendorEmail} this cycle`);
          continue;
        }
        
        const shouldSend = await this.shouldSendVendorNudge(merchant, thread);
        console.log(`      📊 Should send vendor nudge: ${shouldSend}`);
        
        if (shouldSend) {
          const lastOutbound = new Date(thread.last_outbound_at);
          const now = new Date();
          const minutesSinceOutbound = Math.floor((now - lastOutbound) / 60000);
          
          console.log(`⚠️ Thread "${thread.subject}" needs vendor nudge (${minutesSinceOutbound} min since our reply)`);
          
          // Mark this vendor as nudged to prevent duplicates
          nudgedVendors.add(vendorEmail);
          
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
        console.log(`\n✅ Sent ${remindersSent} reminder(s) for ${merchant.company_name}`);
      } else {
        console.log(`\n✅ No reminders needed for ${merchant.company_name}`);
      }
      
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  }

  shouldSendSelfReminder(thread, minutesSinceInbound, selfReminderTime) {
    console.log(`      🔍 shouldSendSelfReminder check:`);
    console.log(`         - minutesSinceInbound: ${minutesSinceInbound}`);
    console.log(`         - selfReminderTime: ${selfReminderTime}`);
    console.log(`         - last_self_reminder_at: ${thread.last_self_reminder_at}`);
    
    // Check max reminders (5)
    const reminderCount = thread.self_reminder_sent_count || 0;
    if (reminderCount >= 5) {
      console.log(`         ❌ Max self-reminders reached (${reminderCount}/5)`);
      return false;
    }
    
    // First reminder: check if enough time passed since vendor email
    if (!thread.last_self_reminder_at) {
      const result = minutesSinceInbound >= selfReminderTime;
      console.log(`         - First reminder: ${minutesSinceInbound} >= ${selfReminderTime} = ${result}`);
      return result;
    }
    
    // Subsequent reminders: 6 hour cooldown (or 30 min for testing)
    const lastReminder = new Date(thread.last_self_reminder_at);
    const now = new Date();
    const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
    const cooldownMinutes = selfReminderTime < 60 ? 30 : 360; // 30 min for testing, 6 hours for production
    
    console.log(`         - Subsequent reminder: ${minutesSinceLastReminder} >= ${cooldownMinutes}`);
    
    return minutesSinceLastReminder >= cooldownMinutes;
  }

  async shouldSendVendorNudge(merchant, thread) {
    console.log(`      🔍 shouldSendVendorNudge check:`);
    
    if (!thread.last_outbound_at) {
      console.log(`         ❌ No last_outbound_at - we haven't replied yet`);
      return false;
    }
    
    const lastOutbound = new Date(thread.last_outbound_at);
    const now = new Date();
    const minutesSinceOutbound = Math.floor((now - lastOutbound) / 60000);
    
    console.log(`         - minutesSinceOutbound: ${minutesSinceOutbound}`);
    console.log(`         - vendor_reminder_time: ${merchant.vendor_reminder_time}`);
    
    // Check if enough time passed since our last reply
    if (minutesSinceOutbound < merchant.vendor_reminder_time) {
      console.log(`         ❌ Not enough time: ${minutesSinceOutbound} < ${merchant.vendor_reminder_time}`);
      return false;
    }
    
    // Check cooldown (30 min for testing, 6 hours for production)
    if (thread.last_vendor_reminder_at) {
      const lastReminder = new Date(thread.last_vendor_reminder_at);
      const minutesSinceLastReminder = Math.floor((now - lastReminder) / 60000);
      const cooldownMinutes = merchant.vendor_reminder_time < 60 ? 30 : 360;
      
      console.log(`         - minutesSinceLastReminder: ${minutesSinceLastReminder}`);
      console.log(`         - cooldownMinutes: ${cooldownMinutes}`);
      
      if (minutesSinceLastReminder < cooldownMinutes) {
        console.log(`         ❌ Cooldown active: ${minutesSinceLastReminder} < ${cooldownMinutes}`);
        return false;
      }
    }
    
    // Max 3 nudges
    const nudgeCount = thread.vendor_reminder_sent_count || 0;
    if (nudgeCount >= 3) {
      console.log(`         ❌ Max nudges reached: ${nudgeCount}/3`);
      return false;
    }
    
    console.log(`         ✅ Should send vendor nudge`);
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

  // Get conversation history for context-aware AI responses
  async getConversationHistory(merchantId, threadId) {
    try {
      const result = await pool.query(
        `SELECT direction, from_email, from_name, body_text, email_date, cc_emails
         FROM emails 
         WHERE merchant_id = $1 AND thread_id = $2 
         ORDER BY email_date ASC`,
        [merchantId, threadId]
      );
      
      const emails = result.rows;
      if (emails.length === 0) {
        return { emailCount: 0, lastEmail: null, conversation: '', originalCC: [] };
      }
      
      // Build conversation string and collect CC recipients
      let conversation = '';
      let originalCC = [];
      
      for (const email of emails) {
        const sender = email.direction === 'inbound' ? 'Vendor' : 'Us';
        const date = new Date(email.email_date).toLocaleString();
        const body = (email.body_text || '').substring(0, 500);
        conversation += `[${date}] ${sender}: ${body}\n\n`;
        
        // Collect CC recipients
        if (email.cc_emails) {
          try {
            const ccList = typeof email.cc_emails === 'string' 
              ? JSON.parse(email.cc_emails) 
              : email.cc_emails;
            
            if (Array.isArray(ccList)) {
              for (const cc of ccList) {
                const ccEmail = cc.address || cc;
                if (ccEmail && !originalCC.includes(ccEmail.toLowerCase())) {
                  originalCC.push(ccEmail.toLowerCase());
                }
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
      
      const lastEmail = emails[emails.length - 1];
      
      return {
        emailCount: emails.length,
        lastEmail: lastEmail,
        conversation: conversation,
        originalCC: originalCC
      };
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return { emailCount: 0, lastEmail: null, conversation: '', originalCC: [] };
    }
  }

  // Filter CC list to exclude merchant and admin emails
  filterCCList(ccList, merchantEmail, adminEmail) {
    return ccList.filter(email => {
      const lowerEmail = email.toLowerCase();
      // Exclude merchant email
      if (lowerEmail === merchantEmail.toLowerCase()) return false;
      // Exclude admin email
      if (adminEmail && lowerEmail === adminEmail.toLowerCase()) return false;
      // Exclude any email containing 'printkart' (our domain)
      if (lowerEmail.includes('printkart')) return false;
      // Exclude lacewingtech (admin domain)
      if (lowerEmail.includes('lacewingtech')) return false;
      return true;
    });
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
      
      console.log(`📧 Self-reminder TO: ${merchant.admin_reminder_email}`);
      
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
      
      // Get conversation history and CC recipients
      const history = await this.getConversationHistory(merchant.id, thread.gmail_thread_id);
      console.log(`📚 Found ${history.emailCount} emails in conversation`);
      console.log(`📧 Original CC recipients: ${history.originalCC.join(', ') || 'none'}`);
      
      // Filter CC list - ONLY keep external stakeholders, exclude merchant and admin
      const filteredCC = this.filterCCList(
        history.originalCC, 
        merchant.gmail_username, 
        merchant.admin_reminder_email
      );
      console.log(`📧 Filtered CC (stakeholders only): ${filteredCC.join(', ') || 'none'}`);
      
      // Check OpenAI key
      if (!process.env.OPENAI_API_KEY) {
        console.log('⚠️ OpenAI not configured - using template');
        return await this.sendVendorNudgeTemplate(merchant, thread, filteredCC);
      }
      
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      
      const lastOutbound = new Date(thread.last_outbound_at);
      const timeSince = this.formatTimeSince(lastOutbound);
      const reminderCount = (thread.vendor_reminder_sent_count || 0) + 1;
      
      console.log(`🤖 Generating context-aware email via ChatGPT...`);
      
      // Build context-aware prompt
      let prompt = `Write a follow-up email for merchant onboarding:

To: ${thread.vendor_name} at ${thread.vendor_email}
From: ${merchant.company_name}
Subject: ${thread.subject}
Time since last message: ${timeSince}
Follow-up #${reminderCount}
`;

      // Add conversation history for context
      if (history.conversation && history.emailCount > 1) {
        prompt += `\n\nConversation History (for context - reference specific details):\n${history.conversation.substring(0, 2000)}`;
      }
      
      prompt += `\n\nRequest an update on the merchant onboarding status. Reference any specific details from the conversation if relevant (like documents shared, pending items, etc.). Keep it brief but contextual.`;
      
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Write ONLY the email body for a professional follow-up email. 

CRITICAL RULES:
- DO NOT include "Subject:" line - the subject is handled separately
- DO NOT include email headers like "To:", "From:", "Date:"
- Start directly with the greeting (e.g., "Dear ${thread.vendor_name}," or "Hi ${thread.vendor_name},")
- Keep it short (3-4 sentences max)
- Sound natural and human
- Be polite but direct
- Reference specific details from conversation history if available (like PAN, Aadhar, GST, documents mentioned)
- Don't use emojis
- Don't mention this is automated
- End with signature: "Best regards,\\n${merchant.company_name}"

OUTPUT FORMAT: Just the email body text, nothing else.`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 250
      });
      
      let aiContent = completion.choices[0].message.content.trim();
      
      // Safety: Remove any "Subject:" line that AI might include
      aiContent = aiContent
        .replace(/^Subject:.*\n?/im, '')  // Remove "Subject: ..." line
        .replace(/^To:.*\n?/im, '')       // Remove "To: ..." line
        .replace(/^From:.*\n?/im, '')     // Remove "From: ..." line
        .replace(/^Date:.*\n?/im, '')     // Remove "Date: ..." line
        .trim();
      
      // ============================================
      // CRITICAL: Email Content Validation Agent
      // ============================================
      
      // Get ALL other merchant names from database
      const otherMerchantsResult = await pool.query(
        'SELECT company_name FROM merchants WHERE id != $1',
        [merchant.id]
      );
      
      // Build blocklist from other merchants' names
      const otherMerchantNames = [];
      for (const row of otherMerchantsResult.rows) {
        const name = row.company_name.toLowerCase();
        otherMerchantNames.push(name);
        // Also add variations without spaces
        otherMerchantNames.push(name.replace(/\s+/g, ''));
        // Add individual words (for multi-word company names)
        const words = name.split(/\s+/);
        if (words.length > 1) {
          words.forEach(word => {
            if (word.length > 3) otherMerchantNames.push(word);
          });
        }
      }
      
      // Also add common problematic terms that AI might hallucinate
      const hardcodedBlocks = ['dipak bhosale', 'dipak', 'bhosale'];
      
      // Get current merchant name variants for comparison
      const currentMerchantLower = merchant.company_name.toLowerCase();
      const currentMerchantWords = currentMerchantLower.split(/\s+/);
      
      // Filter out current merchant from the blocklist
      const blockedNames = [...otherMerchantNames, ...hardcodedBlocks].filter(name => {
        // Don't block if it's part of current merchant name
        if (currentMerchantLower.includes(name)) return false;
        if (currentMerchantWords.some(word => name.includes(word) || word.includes(name))) return false;
        return true;
      });
      
      console.log(`🔒 Content validation: ${blockedNames.length} names blocked`);
      
      // Check if AI content contains any blocked merchant names
      const aiContentLower = aiContent.toLowerCase();
      const foundBlockedName = blockedNames.find(name => aiContentLower.includes(name));
      
      if (foundBlockedName) {
        console.log(`🚨 SECURITY ALERT: AI generated content with blocked name "${foundBlockedName}"`);
        console.log(`🚨 Current merchant: ${merchant.company_name}`);
        console.log(`🚨 AI Content was: ${aiContent.substring(0, 200)}...`);
        console.log(`🚨 Rejecting AI content and using safe template instead`);
        
        // Fall back to safe template
        return await this.sendVendorNudgeTemplate(merchant, thread, filteredCC);
      }
      
      // Force correct signature - remove any existing signature and add correct one
      aiContent = aiContent
        .replace(/Best regards,[\s\S]*$/i, '')  // Remove everything after "Best regards,"
        .replace(/Regards,[\s\S]*$/i, '')       // Remove everything after "Regards,"
        .replace(/Thanks,[\s\S]*$/i, '')        // Remove everything after "Thanks,"
        .replace(/Thank you,[\s\S]*$/i, '')     // Remove everything after "Thank you,"
        .replace(/Sincerely,[\s\S]*$/i, '')     // Remove everything after "Sincerely,"
        .replace(/Warm regards,[\s\S]*$/i, '')  // Remove everything after "Warm regards,"
        .replace(/Kind regards,[\s\S]*$/i, '')  // Remove everything after "Kind regards,"
        .trim();
      
      // Add correct signature
      aiContent += `\n\nBest regards,\n${merchant.company_name}`;
      
      console.log(`✅ ChatGPT generated and validated (${aiContent.length} chars)`);
      console.log(`✅ Signature enforced: ${merchant.company_name}`);
      
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
      
      // Build mail options - TO vendor only, CC stakeholders only
      const mailOptions = {
        from: `${merchant.company_name} <${merchant.gmail_username}>`,
        to: thread.vendor_email,  // ONLY vendor
        subject: `Re: ${thread.subject}`,
        text: aiContent,
        html: `<div style="font-family: Arial; line-height: 1.6;">${aiContent.replace(/\n\n/g, '</p><p>').replace(/^/, '<p>').replace(/$/, '</p>')}</div>`
      };
      
      // Add CC only if there are external stakeholders
      if (filteredCC.length > 0) {
        mailOptions.cc = filteredCC.join(', ');
      }
      
      // Add threading headers - get from thread or fetch from emails table
      let messageIdForReply = thread.last_gmail_message_id;
      let referencesForReply = thread.message_references;
      
      // If not in thread table, try to get from emails table
      if (!messageIdForReply) {
        const lastEmailResult = await pool.query(
          `SELECT gmail_message_id FROM emails 
           WHERE merchant_id = $1 AND thread_id = $2 
           ORDER BY email_date DESC LIMIT 1`,
          [merchant.id, thread.gmail_thread_id]
        );
        if (lastEmailResult.rows.length > 0) {
          messageIdForReply = lastEmailResult.rows[0].gmail_message_id;
        }
      }
      
      if (messageIdForReply) {
        mailOptions.inReplyTo = messageIdForReply;
        mailOptions.references = referencesForReply 
          ? `${referencesForReply} ${messageIdForReply}`
          : messageIdForReply;
        console.log(`🔗 Threading: In-Reply-To: ${messageIdForReply}`);
      } else {
        console.log(`⚠️ No message ID found for threading - email may appear as new thread`);
      }
      
      console.log(`📧 TO (vendor): ${thread.vendor_email}`);
      if (filteredCC.length > 0) {
        console.log(`📧 CC (original stakeholders): ${filteredCC.join(', ')}`);
      }
      
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Vendor nudge #${reminderCount} sent to ${thread.vendor_email}${filteredCC.length > 0 ? ` (CC: ${filteredCC.join(', ')})` : ''}`);
      
      return true;
      
    } catch (error) {
      console.error('❌ Error sending AI nudge:', error.message);
      console.log('⚠️ Falling back to template...');
      return await this.sendVendorNudgeTemplate(merchant, thread, []);
    }
  }

  async sendVendorNudgeTemplate(merchant, thread, filteredCC = []) {
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
        to: thread.vendor_email,  // ONLY vendor
        subject: `Re: ${thread.subject}`,
        text: `Hi ${thread.vendor_name},\n\nI hope this email finds you well. I wanted to follow up on our merchant onboarding process for ${merchant.company_name}.\n\nCould you please provide an update on the current status? We're eager to move forward with the integration.\n\nThank you for your assistance.\n\nBest regards,\n${merchant.company_name}\n${merchant.gmail_username}`,
        html: `<p>Hi ${thread.vendor_name},</p><p>I hope this email finds you well. I wanted to follow up on our merchant onboarding process for ${merchant.company_name}.</p><p>Could you please provide an update on the current status? We're eager to move forward with the integration.</p><p>Thank you for your assistance.</p><p>Best regards,<br>${merchant.company_name}<br>${merchant.gmail_username}</p>`
      };
      
      // Add CC only if there are external stakeholders
      if (filteredCC && filteredCC.length > 0) {
        mailOptions.cc = filteredCC.join(', ');
      }
      
      // Add threading headers - get from thread or fetch from emails table
      let messageIdForReply = thread.last_gmail_message_id;
      let referencesForReply = thread.message_references;
      
      // If not in thread table, try to get from emails table
      if (!messageIdForReply) {
        const lastEmailResult = await pool.query(
          `SELECT gmail_message_id FROM emails 
           WHERE merchant_id = $1 AND thread_id = $2 
           ORDER BY email_date DESC LIMIT 1`,
          [merchant.id, thread.gmail_thread_id]
        );
        if (lastEmailResult.rows.length > 0) {
          messageIdForReply = lastEmailResult.rows[0].gmail_message_id;
        }
      }
      
      if (messageIdForReply) {
        mailOptions.inReplyTo = messageIdForReply;
        mailOptions.references = referencesForReply 
          ? `${referencesForReply} ${messageIdForReply}`
          : messageIdForReply;
        console.log(`🔗 Threading: In-Reply-To: ${messageIdForReply}`);
      }
      
      console.log(`📧 TO (vendor): ${thread.vendor_email}`);
      if (filteredCC && filteredCC.length > 0) {
        console.log(`📧 CC (stakeholders): ${filteredCC.join(', ')}`);
      }
      
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
    
    console.log(`   🕐 Current IST: Day=${day} (0=Sun), Hour=${hour}`);
    console.log(`   🕐 Working hours: Mon-Sat (1-6), 9AM-7PM (9-19)`);
    
    // Monday-Saturday, 9 AM - 7 PM IST
    if (day === 0) { // Sunday
      console.log(`   ❌ Sunday - not working day`);
      return false;
    }
    
    if (hour < 9 || hour >= 19) {
      console.log(`   ❌ Hour ${hour} outside 9-19 range`);
      return false;
    }
    
    return true;
  }
}

// Export instance
const reminderChecker = new ReminderChecker();
export default reminderChecker;