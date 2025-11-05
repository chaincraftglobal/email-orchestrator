-- =============================================
-- EMAIL ORCHESTRATOR DATABASE SCHEMA
-- =============================================

-- Drop tables if they exist (for fresh start)
DROP TABLE IF EXISTS email_threads CASCADE;
DROP TABLE IF EXISTS emails CASCADE;
DROP TABLE IF EXISTS merchants CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

-- =============================================
-- 1. ADMINS TABLE (for login)
-- =============================================
CREATE TABLE admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,  -- Will store hashed password
  email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin (password: admin123 - will be hashed in code)
INSERT INTO admins (username, password, email) 
VALUES ('admin', '$2a$10$XQq0Zv5h5h5h5h5h5h5h5uO', 'admin@example.com');

-- Index for faster login queries
CREATE INDEX idx_admins_username ON admins(username);



-- =============================================
-- 3. EMAILS TABLE (store individual emails)
-- =============================================
CREATE TABLE emails (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  
  -- Gmail specific data
  gmail_message_id VARCHAR(255) UNIQUE NOT NULL,  -- Gmail's unique ID
  thread_id VARCHAR(255) NOT NULL,  -- Gmail thread ID
  
  -- Email details
  subject TEXT,
  from_email VARCHAR(255) NOT NULL,
  from_name VARCHAR(255),
  to_emails JSONB DEFAULT '[]',  -- Array of recipient emails
  cc_emails JSONB DEFAULT '[]',  -- Array of CC emails
  
  -- Content
  body_text TEXT,
  body_html TEXT,
  snippet TEXT,  -- Short preview
  
  -- Metadata
  direction VARCHAR(20) NOT NULL,  -- 'inbound' or 'outbound'
  gateway VARCHAR(50),  -- 'razorpay', 'payu', 'cashfree', 'paytm', 'virtualpay'
  has_attachments BOOLEAN DEFAULT false,
  attachments JSONB DEFAULT '[]',  -- Array of attachment info
  
  -- Dates
  email_date TIMESTAMP NOT NULL,  -- When email was sent/received
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX idx_emails_merchant ON emails(merchant_id);
CREATE INDEX idx_emails_thread ON emails(thread_id);
CREATE INDEX idx_emails_gmail_id ON emails(gmail_message_id);
CREATE INDEX idx_emails_gateway ON emails(gateway);
CREATE INDEX idx_emails_direction ON emails(direction);
CREATE INDEX idx_emails_date ON emails(email_date DESC);


-- =============================================
-- 4. EMAIL THREADS TABLE (group emails into conversations)
-- =============================================
CREATE TABLE email_threads (
  id SERIAL PRIMARY KEY,
  merchant_id INTEGER NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  
  -- Thread identification
  gmail_thread_id VARCHAR(255) NOT NULL,
  subject TEXT NOT NULL,
  gateway VARCHAR(50) NOT NULL,  -- 'razorpay', 'payu', 'cashfree', 'paytm', 'virtualpay'
  vendor_email VARCHAR(255),
  vendor_name VARCHAR(255),
  
  -- Status tracking
  status VARCHAR(50) DEFAULT 'waiting_on_us',  -- 'waiting_on_us', 'waiting_on_vendor', 'completed', 'snoozed'
  last_actor VARCHAR(20),  -- 'us' or 'vendor' (who sent last email)
  
  -- Reminder tracking
  self_reminder_sent_at TIMESTAMP,
  self_reminder_count INTEGER DEFAULT 0,
  vendor_followup_sent_at TIMESTAMP,
  vendor_followup_count INTEGER DEFAULT 0,  -- Max 5
  
  -- Snooze
  is_snoozed BOOLEAN DEFAULT false,
  snoozed_until TIMESTAMP,
  
  -- Activity timestamps
  last_inbound_at TIMESTAMP,  -- Last email FROM vendor
  last_outbound_at TIMESTAMP,  -- Last email TO vendor
  last_activity_at TIMESTAMP NOT NULL,
  
  -- Flags
  is_hot BOOLEAN DEFAULT false,  -- Overdue or urgent
  is_completed BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for faster queries
CREATE INDEX idx_threads_merchant ON email_threads(merchant_id);
CREATE INDEX idx_threads_gmail ON email_threads(gmail_thread_id);
CREATE INDEX idx_threads_status ON email_threads(status);
CREATE INDEX idx_threads_gateway ON email_threads(gateway);
CREATE INDEX idx_threads_hot ON email_threads(is_hot);
CREATE INDEX idx_threads_completed ON email_threads(is_completed);
CREATE INDEX idx_threads_activity ON email_threads(last_activity_at DESC);

-- Unique constraint: one thread per merchant per gmail_thread_id
CREATE UNIQUE INDEX idx_threads_unique ON email_threads(merchant_id, gmail_thread_id);



