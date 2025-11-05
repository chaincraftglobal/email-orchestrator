import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './database.js';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initDatabase() {
  console.log('🔧 Initializing database...');
  
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    console.log('📝 Dropping existing tables...');
    
    // Drop tables in correct order (reverse of creation due to foreign keys)
    await client.query('DROP TABLE IF EXISTS email_threads CASCADE');
    await client.query('DROP TABLE IF EXISTS emails CASCADE');
    await client.query('DROP TABLE IF EXISTS merchants CASCADE');
    await client.query('DROP TABLE IF EXISTS admins CASCADE');
    
    console.log('✅ Old tables dropped');
    console.log('📝 Creating admins table...');
    
    // Create admins table
    await client.query(`
      CREATE TABLE admins (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query('CREATE INDEX idx_admins_username ON admins(username)');
    
    console.log('✅ Admins table created');
    console.log('📝 Creating merchants table...');
    
    // Create merchants table
    await client.query(`
      CREATE TABLE merchants (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(255) NOT NULL,
        gmail_username VARCHAR(255) NOT NULL,
        gmail_app_password TEXT NOT NULL,
        selected_gateways JSONB DEFAULT '[]',
        admin_reminder_email VARCHAR(255) NOT NULL,
        self_reminder_time INTEGER DEFAULT 30,
        vendor_followup_time INTEGER DEFAULT 180,
        email_check_frequency INTEGER DEFAULT 30,
        is_active BOOLEAN DEFAULT true,
        last_email_check TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query('CREATE INDEX idx_merchants_active ON merchants(is_active)');
    await client.query('CREATE INDEX idx_merchants_gmail ON merchants(gmail_username)');
    
    console.log('✅ Merchants table created');
    console.log('📝 Creating emails table...');
    
    // Create emails table
    await client.query(`
      CREATE TABLE emails (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        gmail_message_id VARCHAR(255) UNIQUE NOT NULL,
        thread_id VARCHAR(255) NOT NULL,
        subject TEXT,
        from_email VARCHAR(255) NOT NULL,
        from_name VARCHAR(255),
        to_emails JSONB DEFAULT '[]',
        cc_emails JSONB DEFAULT '[]',
        body_text TEXT,
        body_html TEXT,
        snippet TEXT,
        direction VARCHAR(20) NOT NULL,
        gateway VARCHAR(50),
        has_attachments BOOLEAN DEFAULT false,
        attachments JSONB DEFAULT '[]',
        email_date TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query('CREATE INDEX idx_emails_merchant ON emails(merchant_id)');
    await client.query('CREATE INDEX idx_emails_thread ON emails(thread_id)');
    await client.query('CREATE INDEX idx_emails_gmail_id ON emails(gmail_message_id)');
    await client.query('CREATE INDEX idx_emails_gateway ON emails(gateway)');
    await client.query('CREATE INDEX idx_emails_direction ON emails(direction)');
    await client.query('CREATE INDEX idx_emails_date ON emails(email_date DESC)');
    
    console.log('✅ Emails table created');
    console.log('📝 Creating email_threads table...');
    
    // Create email_threads table
    await client.query(`
      CREATE TABLE email_threads (
        id SERIAL PRIMARY KEY,
        merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
        gmail_thread_id VARCHAR(255) NOT NULL,
        subject TEXT NOT NULL,
        gateway VARCHAR(50) NOT NULL,
        vendor_email VARCHAR(255),
        vendor_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'waiting_on_us',
        last_actor VARCHAR(20),
        self_reminder_sent_at TIMESTAMP,
        self_reminder_count INTEGER DEFAULT 0,
        vendor_followup_sent_at TIMESTAMP,
        vendor_followup_count INTEGER DEFAULT 0,
        is_snoozed BOOLEAN DEFAULT false,
        snoozed_until TIMESTAMP,
        last_inbound_at TIMESTAMP,
        last_outbound_at TIMESTAMP,
        last_activity_at TIMESTAMP NOT NULL,
        is_hot BOOLEAN DEFAULT false,
        is_completed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await client.query('CREATE INDEX idx_threads_merchant ON email_threads(merchant_id)');
    await client.query('CREATE INDEX idx_threads_gmail ON email_threads(gmail_thread_id)');
    await client.query('CREATE INDEX idx_threads_status ON email_threads(status)');
    await client.query('CREATE INDEX idx_threads_gateway ON email_threads(gateway)');
    await client.query('CREATE INDEX idx_threads_hot ON email_threads(is_hot)');
    await client.query('CREATE INDEX idx_threads_completed ON email_threads(is_completed)');
    await client.query('CREATE INDEX idx_threads_activity ON email_threads(last_activity_at DESC)');
    await client.query('CREATE UNIQUE INDEX idx_threads_unique ON email_threads(merchant_id, gmail_thread_id)');
    
    console.log('✅ Email threads table created');
    console.log('📝 Creating default admin user...');
    
    // Hash password and insert admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await client.query(
      'INSERT INTO admins (username, password, email) VALUES ($1, $2, $3)',
      ['admin', hashedPassword, 'admin@example.com']
    );
    
    console.log('✅ Default admin created');
    
    // Commit transaction
    await client.query('COMMIT');
    
    console.log('');
    console.log('🎉 Database initialization complete!');
    console.log('');
    console.log('✅ Tables created:');
    console.log('   - admins');
    console.log('   - merchants');
    console.log('   - emails');
    console.log('   - email_threads');
    console.log('');
    console.log('✅ Default admin credentials:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password after first login!');
    
    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error initializing database:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    client.release();
  }
}

initDatabase();