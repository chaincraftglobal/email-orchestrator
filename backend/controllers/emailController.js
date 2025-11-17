// Test email reminder (Gmail SMTP)
export const testReminder = async (req, res) => {
  try {
    const { merchantId } = req.params;
    
    // Get merchant details
    const merchantResult = await pool.query(
      'SELECT * FROM merchants WHERE id = $1',
      [merchantId]
    );
    
    if (merchantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Merchant not found'
      });
    }
    
    const merchant = merchantResult.rows[0];
    
    const nodemailer = (await import('nodemailer')).default;
    
    // Use Gmail SMTP directly
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: merchant.gmail_username,
        pass: merchant.gmail_app_password
      },
      tls: {
        rejectUnauthorized: false
      }
    });
    
    // Send test email
    const mailOptions = {
      from: `${merchant.company_name} <${merchant.gmail_username}>`,
      to: merchant.admin_reminder_email,
      subject: '✅ Test Email - Email Orchestrator',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">
            <h1 style="margin: 0;">✅ Test Email Successful!</h1>
            <p style="margin: 10px 0 0 0;">Email Orchestrator - Gmail SMTP</p>
          </div>
          
          <div style="padding: 30px;">
            <h2 style="color: #1f2937;">Gmail SMTP Verified ✅</h2>
            <p>Your email system is working correctly using Gmail SMTP directly!</p>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">System Details:</h3>
              <ul style="line-height: 1.8;">
                <li><strong>Merchant:</strong> ${merchant.company_name}</li>
                <li><strong>Gmail:</strong> ${merchant.gmail_username}</li>
                <li><strong>Admin Email:</strong> ${merchant.admin_reminder_email}</li>
                <li><strong>SMTP:</strong> Gmail Direct (Port 465)</li>
                <li><strong>Status:</strong> ✅ Active</li>
              </ul>
            </div>
            
            <div style="background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #065f46;">
                <strong>✅ All Systems Operational!</strong><br>
                • Admin reminders: Gmail SMTP<br>
                • Vendor nudges: Gmail SMTP + ChatGPT AI<br>
                • Emails show in Gmail Sent folder
              </p>
            </div>
          </div>
          
          <div style="background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280;">
            <p style="margin: 0;">Email Orchestrator • Powered by Gmail SMTP</p>
          </div>
        </div>
      `
    };
    
    await transporter.sendMail(mailOptions);
    
    res.json({
      success: true,
      message: `Test email sent successfully to ${merchant.admin_reminder_email} via Gmail SMTP`
    });
    
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email: ' + error.message
    });
  }
};