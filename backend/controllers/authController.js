import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';

// Login function
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Username and password are required' 
      });
    }
    
    // Find admin user
   const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid username or password' 
      });
    }
    
    const admin = result.rows[0];
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid username or password' 
      });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { 
        id: admin.id, 
        username: admin.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Return success with token
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: admin.id,
        username: admin.username,
        email: admin.email
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
};

// Verify token function (for checking if user is logged in)
export const verifyToken = async (req, res) => {
  try {
    // If we reach here, token is valid (checked by middleware)
    res.json({
      success: true,
      user: req.user
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};