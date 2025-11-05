import emailScheduler from '../services/emailScheduler.js';

// Start scheduler for all merchants
export const startScheduler = async (req, res) => {
  try {
    if (emailScheduler.isRunning) {
      return res.json({
        success: true,
        message: 'Scheduler is already running',
        status: emailScheduler.getStatus()
      });
    }
    
    await emailScheduler.startAll();
    
    res.json({
      success: true,
      message: 'Email scheduler started successfully',
      status: emailScheduler.getStatus()
    });
  } catch (error) {
    console.error('Start scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start scheduler'
    });
  }
};

// Stop scheduler for all merchants
export const stopScheduler = async (req, res) => {
  try {
    emailScheduler.stopAll();
    
    res.json({
      success: true,
      message: 'Email scheduler stopped successfully',
      status: emailScheduler.getStatus()
    });
  } catch (error) {
    console.error('Stop scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop scheduler'
    });
  }
};

// Get scheduler status
export const getSchedulerStatus = async (req, res) => {
  try {
    const status = emailScheduler.getStatus();
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get scheduler status'
    });
  }
};

// Restart scheduler (stop and start)
export const restartScheduler = async (req, res) => {
  try {
    emailScheduler.stopAll();
    await emailScheduler.startAll();
    
    res.json({
      success: true,
      message: 'Email scheduler restarted successfully',
      status: emailScheduler.getStatus()
    });
  } catch (error) {
    console.error('Restart scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restart scheduler'
    });
  }
};

// Start scheduler for specific merchant
export const startMerchantScheduler = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    // Get merchant from database
    const pool = (await import('../config/database.js')).default;
    const result = await pool.query(
      'SELECT * FROM merchants WHERE id = $1',
      [merchantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }
    
    const merchant = result.rows[0];
    await emailScheduler.startForMerchant(merchant);
    
    res.json({
      success: true,
      message: `Scheduler started for ${merchant.company_name}`,
      status: emailScheduler.getStatus()
    });
  } catch (error) {
    console.error('Start merchant scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start merchant scheduler'
    });
  }
};

// Stop scheduler for specific merchant
export const stopMerchantScheduler = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    emailScheduler.stopForMerchant(parseInt(merchantId));
    
    res.json({
      success: true,
      message: 'Merchant scheduler stopped',
      status: emailScheduler.getStatus()
    });
  } catch (error) {
    console.error('Stop merchant scheduler error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to stop merchant scheduler'
    });
  }
};