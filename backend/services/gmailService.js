import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { promisify } from 'util';

class GmailService {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.imap = null;
  }

  // Connect to Gmail IMAP
  async connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap({
        user: this.username,
        password: this.password,
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000
      });

      this.imap.once('ready', () => {
        console.log(`✅ Connected to Gmail: ${this.username}`);
        resolve();
      });

      this.imap.once('error', (err) => {
        console.error(`❌ IMAP connection error: ${err.message}`);
        reject(err);
      });

      this.imap.connect();
    });
  }

  // Disconnect from Gmail
  disconnect() {
    if (this.imap) {
      this.imap.end();
    }
  }

  // Fetch recent emails (last N emails)
  async fetchRecentEmails(limit = 50) {
    try {
      await this.connect();

      return new Promise((resolve, reject) => {
        this.imap.openBox('INBOX', true, (err, box) => {
          if (err) {
            this.disconnect();
            return reject(err);
          }

          // Get message count
          const totalMessages = box.messages.total;
          if (totalMessages === 0) {
            this.disconnect();
            return resolve([]);
          }

          // Fetch last N messages
          const start = Math.max(1, totalMessages - limit + 1);
          const end = totalMessages;
          const range = `${start}:${end}`;

          const fetch = this.imap.seq.fetch(range, {
            bodies: '',
            struct: true
          });

          const emails = [];

          fetch.on('message', (msg, seqno) => {
            let buffer = '';
            let attributes = null;

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs) => {
              attributes = attrs;
            });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                
                emails.push({
                  uid: attributes.uid,
                  messageId: parsed.messageId,
                  threadId: parsed.inReplyTo || parsed.messageId,
                  from: parsed.from?.value?.[0] || {},
                  to: parsed.to?.value || [],
                  cc: parsed.cc?.value || [],
                  subject: parsed.subject || '(No Subject)',
                  text: parsed.text || '',
                  html: parsed.html || '',
                  date: parsed.date || new Date(),
                  attachments: parsed.attachments?.map(att => ({
                    filename: att.filename,
                    size: att.size,
                    contentType: att.contentType
                  })) || []
                });
              } catch (parseErr) {
                console.error('Error parsing email:', parseErr);
              }
            });
          });

          fetch.once('error', (fetchErr) => {
            console.error('Fetch error:', fetchErr);
            this.disconnect();
            reject(fetchErr);
          });

          fetch.once('end', () => {
            console.log(`✅ Fetched ${emails.length} emails`);
            this.disconnect();
            resolve(emails);
          });
        });
      });
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }

  // Fetch emails from sent folder
  async fetchSentEmails(limit = 50) {
    try {
      await this.connect();

      return new Promise((resolve, reject) => {
        this.imap.openBox('[Gmail]/Sent Mail', true, (err, box) => {
          if (err) {
            this.disconnect();
            return reject(err);
          }

          const totalMessages = box.messages.total;
          if (totalMessages === 0) {
            this.disconnect();
            return resolve([]);
          }

          const start = Math.max(1, totalMessages - limit + 1);
          const end = totalMessages;
          const range = `${start}:${end}`;

          const fetch = this.imap.seq.fetch(range, {
            bodies: '',
            struct: true
          });

          const emails = [];

          fetch.on('message', (msg, seqno) => {
            let buffer = '';
            let attributes = null;

            msg.on('body', (stream, info) => {
              stream.on('data', (chunk) => {
                buffer += chunk.toString('utf8');
              });
            });

            msg.once('attributes', (attrs) => {
              attributes = attrs;
            });

            msg.once('end', async () => {
              try {
                const parsed = await simpleParser(buffer);
                
                emails.push({
                  uid: attributes.uid,
                  messageId: parsed.messageId,
                  threadId: parsed.inReplyTo || parsed.messageId,
                  from: parsed.from?.value?.[0] || {},
                  to: parsed.to?.value || [],
                  cc: parsed.cc?.value || [],
                  subject: parsed.subject || '(No Subject)',
                  text: parsed.text || '',
                  html: parsed.html || '',
                  date: parsed.date || new Date(),
                  attachments: parsed.attachments?.map(att => ({
                    filename: att.filename,
                    size: att.size,
                    contentType: att.contentType
                  })) || []
                });
              } catch (parseErr) {
                console.error('Error parsing email:', parseErr);
              }
            });
          });

          fetch.once('error', (fetchErr) => {
            console.error('Fetch error:', fetchErr);
            this.disconnect();
            reject(fetchErr);
          });

          fetch.once('end', () => {
            console.log(`✅ Fetched ${emails.length} sent emails`);
            this.disconnect();
            resolve(emails);
          });
        });
      });
    } catch (error) {
      this.disconnect();
      throw error;
    }
  }
}

export default GmailService;