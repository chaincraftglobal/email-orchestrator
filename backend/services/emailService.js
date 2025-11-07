import Imap from 'imap';
import { simpleParser } from 'mailparser';
import pool from '../config/database.js';
import GatewayDetector from './gatewayDetector.js';

class EmailService {
  
  /**
   * Fetch and process emails for a merchant
   * @param {Object} merchant - Merchant object from database
   * @returns {Object} - Statistics about processed emails
   */
  static async fetchAndProcessEmails(merchant) {
    console.log(`📧 Checking emails for ${merchant.company_name}...`);
    
    try {
      // Fetch inbox emails
      const inboxEmails = await this.fetchEmailsFromFolder(merchant, 'INBOX');
      console.log(`📥 Fetched ${inboxEmails.length} inbox emails`);
      
      // Fetch sent emails
      const sentEmails = await this.fetchEmailsFromFolder(merchant, '[Gmail]/Sent Mail');
      console.log(`📤 Fetched ${sentEmails.length} sent emails`);
      
      // Process all emails
      let newEmailsCount = 0;
      let newThreadsCount = 0;
      
      // Process inbox emails (inbound)
      for (const email of inboxEmails) {
        const result = await this.processEmail(email, merchant, 'inbound');
        if (result.isNew) newEmailsCount++;
        if (result.isNewThread) newThreadsCount++;
      }
      
      // Process sent emails (outbound)
      for (const email of sentEmails) {
        const result = await this.processEmail(email, merchant, 'outbound');
        if (result.isNew) newEmailsCount++;
      }
      
      // Update merchant's last_email_check
      await pool.query(
        'UPDATE merchants SET last_email_check = NOW() WHERE id = $1',
        [merchant.id]
      );
      
      console.log(`✅ ${merchant.company_name}: Found ${newEmailsCount} new gateway emails`);
      
      return {
        newEmails: newEmailsCount,
        newThreads: newThreadsCount,
        totalEmails: inboxEmails.length + sentEmails.length
      };
      
    } catch (error) {
      console.error(`❌ Error fetching emails for ${merchant.company_name}:`, error);
      throw error;
    }
  }
  
  /**
   * Fetch emails from a specific Gmail folder
   * @param {Object} merchant
   * @param {String} folder - INBOX or [Gmail]/Sent Mail
   * @returns {Array} - Array of parsed email objects
   */
  static async fetchEmailsFromFolder(merchant, folder) {
    return new Promise((resolve, reject) => {
      const imap = new Imap({
        user: merchant.gmail_username,
        password: merchant.gmail_app_password,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false }
      });
      
      const emails = [];
      
      imap.once('ready', () => {
        console.log(`✅ Connected to Gmail: ${merchant.gmail_username}`);
        
        imap.openBox(folder, true, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          
          // Fetch recent emails (last 30 days)
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          imap.search(['ALL', ['SINCE', thirtyDaysAgo]], (err, results) => {
            if (err) {
              imap.end();
              return reject(err);
            }
            
            if (results.length === 0) {
              console.log(`✅ Fetched 0 emails from ${folder}`);
              imap.end();
              return resolve([]);
            }
            
            console.log(`✅ Fetched ${results.length} emails`);
            
            const fetch = imap.fetch(results, { bodies: '' });
            
            fetch.on('message', (msg, seqno) => {
              msg.on('body', (stream, info) => {
                simpleParser(stream, async (err, parsed) => {
                  if (err) {
                    console.error('Parse error:', err);
                    return;
                  }
                  
                  emails.push({
                    messageId: parsed.messageId,
                    threadId: parsed.references?.[0] || parsed.messageId,
                    from: parsed.from?.value?.[0],
                    to: parsed.to?.value || [],
                    cc: parsed.cc?.value || [],
                    subject: parsed.subject,
                    date: parsed.date,
                    text: parsed.text,
                    html: parsed.html,
                    attachments: parsed.attachments || []
                  });
                });
              });
            });
            
            fetch.once('error', (err) => {
              console.error('Fetch error:', err);
              imap.end();
              reject(err);
            });
            
            fetch.once('end', () => {
              imap.end();
              resolve(emails);
            });
          });
        });
      });
      
      imap.once('error', (err) => {
        console.error('IMAP error:', err);
        reject(err);
      });
      
      imap.connect();
    });
  }
  
  /**
   * Process a single email
   * @param {Object} email
   * @param {Object} merchant
   * @param {String} direction - 'inbound' or 'outbound'
   * @returns {Object} - {isNew, isNewThread}
   */
  static async processEmail(email, merchant, direction) {
    try {
      // Check if email already exists
      const existingEmail = await pool.query(
        'SELECT id FROM emails WHERE gmail_message_id = $1',
        [email.messageId]
      );
      
      if (existingEmail.rows.length > 0) {
        return { isNew: false, isNewThread: false };
      }
      
      // Only detect gateway for inbound emails
      let gateway = null;
      let isGatewayEmail = false;
      
      if (direction === 'inbound') {
        gateway = GatewayDetector.detectGateway(email, merchant.selected_gateways);
        isGatewayEmail = gateway !== null;
      }
      
      // If not a gateway email, skip it
      if (direction === 'inbound' && !isGatewayEmail) {
        return { isNew: false, isNewThread: false };
      }
      
      // Save email to database
      await pool.query(
        `INSERT INTO emails (
          merchant_id, gmail_message_id, thread_id,
          subject, from_email, from_name,
          to_emails, cc_emails,
          body_text, body_html, snippet,
          direction, gateway, has_attachments, attachments, email_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          merchant.id,
          email.messageId,
          email.threadId,
          email.subject,
          email.from?.address,
          email.from?.name,
          JSON.stringify(email.to),
          JSON.stringify(email.cc),
          email.text,
          email.html,
          email.text?.substring(0, 200) || '',
          direction,
          gateway,
          email.attachments.length > 0,
          JSON.stringify(email.attachments.map(a => ({ filename: a.filename, size: a.size }))),
          email.date
        ]
      );
      
      // Create or update thread (only for gateway emails)
      let isNewThread = false;
      if (isGatewayEmail) {
        isNewThread = await this.createOrUpdateThread(email, merchant, gateway, direction);
      }
      
      return { isNew: true, isNewThread };
      
    } catch (error) {
      console.error('Process email error:', error);
      return { isNew: false, isNewThread: false };
    }
  }
  
  /**
   * Create or update email thread
   * @param {Object} email
   * @param {Object} merchant
   * @param {String} gateway
   * @param {String} direction
   * @returns {Boolean} - true if new thread created
   */
  static async createOrUpdateThread(email, merchant, gateway, direction) {
    try {
      // Check if thread exists
      const existingThread = await pool.query(
        'SELECT * FROM email_threads WHERE merchant_id = $1 AND gmail_thread_id = $2',
        [merchant.id, email.threadId]
      );
      
      if (existingThread.rows.length === 0) {
        // Create new thread
        await pool.query(
          `INSERT INTO email_threads (
            merchant_id, gmail_thread_id, subject, gateway,
            vendor_email, vendor_name, status, last_actor,
            last_inbound_at, last_activity_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            merchant.id,
            email.threadId,
            email.subject,
            gateway,
            GatewayDetector.extractVendorEmail(email),
            GatewayDetector.extractVendorName(email),
            direction === 'inbound' ? 'waiting_on_us' : 'waiting_on_vendor',
            direction === 'inbound' ? 'vendor' : 'us',
            direction === 'inbound' ? email.date : null,
            email.date
          ]
        );
        
        return true;
      } else {
        // Update existing thread
        if (direction === 'inbound') {
          await pool.query(
            `UPDATE email_threads 
             SET last_inbound_at = $1, last_activity_at = $2, 
                 status = 'waiting_on_us', last_actor = 'vendor'
             WHERE id = $3`,
            [email.date, email.date, existingThread.rows[0].id]
          );
        } else {
          await pool.query(
            `UPDATE email_threads 
             SET last_outbound_at = $1, last_activity_at = $2, 
                 status = 'waiting_on_vendor', last_actor = 'us'
             WHERE id = $3`,
            [email.date, email.date, existingThread.rows[0].id]
          );
        }
        
        return false;
      }
    } catch (error) {
      console.error('Thread error:', error);
      return false;
    }
  }
}

export default EmailService;
