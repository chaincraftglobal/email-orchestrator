import pool from '../config/database.js';
import Imap from 'imap';

// Get all merchants
export const getAllMerchants = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, company_name, gmail_username, selected_gateways, admin_reminder_email, self_reminder_time, vendor_followup_time, email_check_frequency, is_active, last_email_check, created_at FROM merchants ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      merchants: result.rows
    });
  } catch (error) {
    console.error('Get merchants error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch merchants'
    });
  }
};

// Get single merchant by ID
export const getMerchantById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT id, company_name, gmail_username, selected_gateways, admin_reminder_email, self_reminder_time, vendor_followup_time, email_check_frequency, is_active, last_email_check, created_at FROM merchants WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }
    
    res.json({
      success: true,
      merchant: result.rows[0]
    });
  } catch (error) {
    console.error('Get merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch merchant'
    });
  }
};

// Test Gmail connection
export const testGmailConnection = async (req, res) => {
  try {
    const { gmail_username, gmail_app_password } = req.body;
    
    if (!gmail_username || !gmail_app_password) {
      return res.status(400).json({
        success: false,
        message: 'Gmail username and password are required'
      });
    }
    
    // Create IMAP connection
    const imap = new Imap({
      user: gmail_username,
      password: gmail_app_password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
    
    // Test connection
    return new Promise((resolve, reject) => {
      imap.once('ready', () => {
        imap.end();
        resolve(res.json({
          success: true,
          message: 'Gmail connection successful!'
        }));
      });
      
      imap.once('error', (err) => {
        reject(res.status(401).json({
          success: false,
          message: 'Gmail authentication failed. Please check credentials.'
        }));
      });
      
      imap.connect();
    });
    
  } catch (error) {
    console.error('Test Gmail error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Gmail connection'
    });
  }
};

// Create new merchant
export const createMerchant = async (req, res) => {
  try {
    const {
      company_name,
      gmail_username,
      gmail_app_password,
      selected_gateways,
      admin_reminder_email,
      self_reminder_time,
      vendor_followup_time,
      email_check_frequency
    } = req.body;
    
    // Validate required fields
    if (!company_name || !gmail_username || !gmail_app_password || !admin_reminder_email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    // Validate selected_gateways is an array
    if (!Array.isArray(selected_gateways) || selected_gateways.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one payment gateway must be selected'
      });
    }
    
    // Insert merchant - PostgreSQL will handle array conversion automatically with $X notation
    const result = await pool.query(
      `INSERT INTO merchants (
        company_name, gmail_username, gmail_app_password,
        selected_gateways, admin_reminder_email,
        self_reminder_time, vendor_followup_time, email_check_frequency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        company_name,
        gmail_username,
        gmail_app_password,
        selected_gateways, // PostgreSQL will convert JS array automatically
        admin_reminder_email,
        self_reminder_time || 360,
        vendor_followup_time || 1440,
        email_check_frequency || 30
      ]
    );
    
    res.json({
      success: true,
      message: 'Merchant created successfully',
      merchant: result.rows[0]
    });
    
  } catch (error) {
    console.error('Create merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create merchant',
      error: error.message
    });
  }
};

// Update merchant
export const updateMerchant = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      company_name,
      gmail_username,
      gmail_app_password,
      selected_gateways,
      admin_reminder_email,
      self_reminder_time,
      vendor_followup_time,
      email_check_frequency,
      is_active
    } = req.body;
    
    const result = await pool.query(
      `UPDATE merchants SET 
        company_name = $1, gmail_username = $2, gmail_app_password = $3,
        selected_gateways = $4, admin_reminder_email = $5,
        self_reminder_time = $6, vendor_followup_time = $7,
        email_check_frequency = $8, is_active = $9, updated_at = CURRENT_TIMESTAMP
      WHERE id = $10 RETURNING *`,
      [
        company_name,
        gmail_username,
        gmail_app_password,
        JSON.stringify(selected_gateways || []),
        admin_reminder_email,
        self_reminder_time,
        vendor_followup_time,
        email_check_frequency,
        is_active,
        id
      ]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Merchant updated successfully',
      merchant: result.rows[0]
    });
    
  } catch (error) {
    console.error('Update merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update merchant'
    });
  }
};

// Delete merchant
export const deleteMerchant = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM merchants WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Merchant deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete merchant error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete merchant'
    });
  }
};