import pool from '../config/database.js';
import Imap from 'imap';

// Get all merchants
export const getAllMerchants = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, company_name, gmail_username, selected_gateways, 
       admin_reminder_email, self_reminder_time, vendor_reminder_time,
       email_check_frequency, is_active, last_email_check, created_at 
       FROM merchants ORDER BY created_at DESC`
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
      `SELECT id, company_name, gmail_username, selected_gateways, 
       admin_reminder_email, self_reminder_time, vendor_reminder_time, 
       email_check_frequency, is_active, last_email_check, created_at 
       FROM merchants WHERE id = $1`,
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
    
    const imap = new Imap({
      user: gmail_username,
      password: gmail_app_password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    });
    
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
      admin_reminder_email,
      self_reminder_time,
      vendor_reminder_time,
      email_check_frequency,
      selected_gateways
    } = req.body;
    
    // Convert to array if needed
    let gatewaysArray = selected_gateways;
    if (typeof selected_gateways === 'string') {
      try {
        gatewaysArray = JSON.parse(selected_gateways);
      } catch {
        gatewaysArray = [];
      }
    }
    if (!Array.isArray(gatewaysArray)) {
      gatewaysArray = [];
    }
    
    const result = await pool.query(
      `INSERT INTO merchants (
        company_name, gmail_username, gmail_app_password,
        admin_reminder_email, self_reminder_time, vendor_reminder_time,
        email_check_frequency, selected_gateways, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        company_name,
        gmail_username,
        gmail_app_password,
        admin_reminder_email,
        self_reminder_time || 360,
        vendor_reminder_time || 1440,
        email_check_frequency || 5,
        gatewaysArray, // Send as array, not JSON string
        true
      ]
    );
    
    res.status(201).json({
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
      admin_reminder_email,
      self_reminder_time,
      vendor_reminder_time,
      email_check_frequency,
      selected_gateways,
      is_active
    } = req.body;
    
    // Convert to array if needed
    let gatewaysArray = selected_gateways;
    if (typeof selected_gateways === 'string') {
      try {
        gatewaysArray = JSON.parse(selected_gateways);
      } catch {
        gatewaysArray = [];
      }
    }
    if (!Array.isArray(gatewaysArray)) {
      gatewaysArray = [];
    }
    
    // Build dynamic query - only update password if provided
    let query;
    let params;
    
    if (gmail_app_password && gmail_app_password.trim() !== '') {
      // Update WITH password
      query = `UPDATE merchants 
       SET company_name = $1,
           gmail_username = $2,
           gmail_app_password = $3,
           admin_reminder_email = $4,
           self_reminder_time = $5,
           vendor_reminder_time = $6,
           email_check_frequency = $7,
           selected_gateways = $8,
           is_active = $9,
           updated_at = NOW()
       WHERE id = $10
       RETURNING *`;
      
      params = [
        company_name,
        gmail_username,
        gmail_app_password,
        admin_reminder_email,
        self_reminder_time,
        vendor_reminder_time,
        email_check_frequency,
        gatewaysArray, // Send as array
        is_active,
        id
      ];
    } else {
      // Update WITHOUT password (keep existing)
      query = `UPDATE merchants 
       SET company_name = $1,
           gmail_username = $2,
           admin_reminder_email = $3,
           self_reminder_time = $4,
           vendor_reminder_time = $5,
           email_check_frequency = $6,
           selected_gateways = $7,
           is_active = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`;
      
      params = [
        company_name,
        gmail_username,
        admin_reminder_email,
        self_reminder_time,
        vendor_reminder_time,
        email_check_frequency,
        gatewaysArray, // Send as array
        is_active,
        id
      ];
    }
    
    const result = await pool.query(query, params);
    
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
      message: 'Failed to update merchant',
      error: error.message
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