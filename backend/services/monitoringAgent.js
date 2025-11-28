import pool from '../config/database.js';
import nodemailer from 'nodemailer';

/**
 * 🤖 EMAIL ORCHESTRATOR MONITORING AGENT
 * 
 * This agent continuously monitors the system health and alerts admin when:
 * - Emails not being fetched for too long
 * - Threads stuck in wrong status
 * - Reminders not being sent
 * - Self-email loops detected
 * - Database connection issues
 * - Any anomalies in the system
 * 
 * It sends a daily health report and instant alerts for critical issues.
 */

class MonitoringAgent {
  constructor() {
    this.checkInterval = null;
    this.dailyReportInterval = null;
    this.alertCooldowns = new Map(); // Prevent spam alerts
    this.metrics = {
      lastCheck: null,
      checksPerformed: 0,
      alertsSent: 0,
      issuesFound: [],
      systemHealth: 'unknown'
    };
    
    console.log('🤖 Monitoring Agent initialized');
  }

  // ==================== CONFIGURATION ====================
  
  getConfig() {
    return {
      // Check intervals
      healthCheckInterval: 10 * 60 * 1000,  // Every 10 minutes
      dailyReportTime: '09:00',              // 9 AM IST
      
      // Alert thresholds
      maxMinutesSinceEmailCheck: 30,         // Alert if no email check for 30 min
      maxStuckThreadMinutes: 120,            // Alert if thread stuck for 2 hours
      maxPendingReminders: 10,               // Alert if too many pending reminders
      maxSelfEmailLoopCount: 3,              // Alert if potential self-loop detected
      
      // Alert cooldowns (prevent spam)
      alertCooldownMinutes: 60,              // Don't repeat same alert for 1 hour
      
      // Admin notification email
      adminEmail: process.env.ADMIN_ALERT_EMAIL || 'dipak.lacewingtech@gmail.com',
      
      // Expected behaviors
      expectedWorkingHours: { start: 9, end: 19 }, // 9 AM - 7 PM IST
      expectedWorkingDays: [1, 2, 3, 4, 5, 6],     // Mon-Sat
    };
  }

  // ==================== START/STOP ====================

  start() {
    console.log('🤖 Starting Monitoring Agent...');
    
    const config = this.getConfig();
    
    // Run initial health check
    this.performHealthCheck();
    
    // Schedule regular health checks
    this.checkInterval = setInterval(() => {
      this.performHealthCheck();
    }, config.healthCheckInterval);
    
    // Schedule daily report at 9 AM IST
    this.scheduleDailyReport();
    
    console.log('✅ Monitoring Agent started');
    console.log(`   📊 Health checks: every ${config.healthCheckInterval / 60000} minutes`);
    console.log(`   📧 Daily report: ${config.dailyReportTime} IST`);
    console.log(`   🚨 Alerts to: ${config.adminEmail}`);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.dailyReportInterval) {
      clearInterval(this.dailyReportInterval);
      this.dailyReportInterval = null;
    }
    console.log('🤖 Monitoring Agent stopped');
  }

  scheduleDailyReport() {
    // Check every minute if it's time for daily report
    this.dailyReportInterval = setInterval(() => {
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(now.getTime() + istOffset);
      const hours = istTime.getUTCHours();
      const minutes = istTime.getUTCMinutes();
      
      // Send at 9:00 AM IST
      if (hours === 9 && minutes === 0) {
        this.sendDailyReport();
      }
    }, 60 * 1000); // Check every minute
  }

  // ==================== HEALTH CHECKS ====================

  async performHealthCheck() {
    console.log(`\n🤖 [${new Date().toISOString()}] Performing health check...`);
    
    const issues = [];
    const config = this.getConfig();
    
    try {
      // 1. Check database connection
      const dbStatus = await this.checkDatabaseConnection();
      if (!dbStatus.healthy) {
        issues.push({ type: 'CRITICAL', message: 'Database connection failed', details: dbStatus.error });
      }
      
      // 2. Check if emails are being fetched
      const fetchStatus = await this.checkEmailFetching();
      if (!fetchStatus.healthy) {
        issues.push({ type: 'WARNING', message: fetchStatus.message, details: fetchStatus.details });
      }
      
      // 3. Check for stuck threads
      const stuckThreads = await this.checkStuckThreads();
      if (stuckThreads.length > 0) {
        issues.push({ type: 'WARNING', message: `${stuckThreads.length} threads may be stuck`, details: stuckThreads });
      }
      
      // 4. Check for self-email loops
      const loopStatus = await this.checkSelfEmailLoops();
      if (!loopStatus.healthy) {
        issues.push({ type: 'CRITICAL', message: 'Potential self-email loop detected', details: loopStatus.details });
      }
      
      // 5. Check reminder system
      const reminderStatus = await this.checkReminderSystem();
      if (!reminderStatus.healthy) {
        issues.push({ type: 'WARNING', message: reminderStatus.message, details: reminderStatus.details });
      }
      
      // 6. Check for anomalies
      const anomalies = await this.checkAnomalies();
      for (const anomaly of anomalies) {
        issues.push({ type: 'INFO', message: anomaly.message, details: anomaly.details });
      }
      
      // Update metrics
      this.metrics.lastCheck = new Date();
      this.metrics.checksPerformed++;
      this.metrics.issuesFound = issues;
      this.metrics.systemHealth = issues.filter(i => i.type === 'CRITICAL').length > 0 ? 'critical' :
                                   issues.filter(i => i.type === 'WARNING').length > 0 ? 'warning' : 'healthy';
      
      // Log summary
      if (issues.length === 0) {
        console.log('✅ System health: ALL GOOD');
      } else {
        console.log(`⚠️ System health: ${issues.length} issue(s) found`);
        for (const issue of issues) {
          console.log(`   ${issue.type}: ${issue.message}`);
        }
      }
      
      // Send alerts for critical/warning issues
      await this.processAlerts(issues);
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      await this.sendAlert('CRITICAL', 'Health check system failed', error.message);
    }
  }

  // ==================== INDIVIDUAL CHECKS ====================

  async checkDatabaseConnection() {
    try {
      const result = await pool.query('SELECT NOW() as time');
      return { healthy: true, serverTime: result.rows[0].time };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async checkEmailFetching() {
    try {
      const config = this.getConfig();
      
      // Check last email check time for each merchant
      const result = await pool.query(`
        SELECT 
          company_name,
          last_email_check,
          EXTRACT(EPOCH FROM (NOW() - last_email_check))/60 as minutes_since_check
        FROM merchants 
        WHERE is_active = true
      `);
      
      const staleChecks = result.rows.filter(m => 
        m.minutes_since_check > config.maxMinutesSinceEmailCheck
      );
      
      if (staleChecks.length > 0) {
        return {
          healthy: false,
          message: `${staleChecks.length} merchant(s) haven't been checked recently`,
          details: staleChecks.map(m => `${m.company_name}: ${Math.round(m.minutes_since_check)} min ago`)
        };
      }
      
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: 'Failed to check email fetching', details: error.message };
    }
  }

  async checkStuckThreads() {
    try {
      const config = this.getConfig();
      
      // Find threads that have been in same status too long without activity
      const result = await pool.query(`
        SELECT 
          et.id,
          et.subject,
          et.status,
          et.last_activity_at,
          m.company_name,
          EXTRACT(EPOCH FROM (NOW() - et.last_activity_at))/60 as minutes_stuck
        FROM email_threads et
        JOIN merchants m ON et.merchant_id = m.id
        WHERE et.status IN ('waiting_on_us', 'waiting_on_vendor')
        AND et.last_activity_at < NOW() - INTERVAL '${config.maxStuckThreadMinutes} minutes'
        AND et.is_hot = false
      `);
      
      return result.rows.map(t => ({
        subject: t.subject,
        status: t.status,
        merchant: t.company_name,
        minutesStuck: Math.round(t.minutes_stuck)
      }));
    } catch (error) {
      console.error('Error checking stuck threads:', error);
      return [];
    }
  }

  async checkSelfEmailLoops() {
    try {
      // Check if there are multiple threads with same subject (potential loop)
      const result = await pool.query(`
        SELECT 
          LOWER(REGEXP_REPLACE(subject, '^(Re|RE|re|Fwd|FWD|fwd):\\s*', '', 'gi')) as normalized_subject,
          COUNT(*) as thread_count,
          merchant_id
        FROM email_threads
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY normalized_subject, merchant_id
        HAVING COUNT(*) > 2
      `);
      
      if (result.rows.length > 0) {
        return {
          healthy: false,
          details: result.rows.map(r => `"${r.normalized_subject}" has ${r.thread_count} threads`)
        };
      }
      
      // Check if reminder emails are being saved (they shouldn't be)
      const reminderCheck = await pool.query(`
        SELECT COUNT(*) as count FROM emails 
        WHERE subject ILIKE '%reminder%' 
        OR subject ILIKE '%action required%'
        OR subject LIKE '%⚠️%'
      `);
      
      if (parseInt(reminderCheck.rows[0].count) > 0) {
        return {
          healthy: false,
          details: [`${reminderCheck.rows[0].count} reminder emails saved to database (should be 0)`]
        };
      }
      
      return { healthy: true };
    } catch (error) {
      return { healthy: false, details: [error.message] };
    }
  }

  async checkReminderSystem() {
    try {
      // Check if reminders are being sent when expected
      const result = await pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'waiting_on_us' AND self_reminder_sent_count = 0 
            AND last_inbound_at < NOW() - INTERVAL '1 hour') as overdue_self_reminders,
          COUNT(*) FILTER (WHERE status = 'waiting_on_vendor' AND vendor_reminder_sent_count = 0 
            AND last_outbound_at < NOW() - INTERVAL '2 days') as overdue_vendor_nudges
        FROM email_threads
        WHERE is_completed = false
      `);
      
      const { overdue_self_reminders, overdue_vendor_nudges } = result.rows[0];
      
      if (parseInt(overdue_self_reminders) > 0 || parseInt(overdue_vendor_nudges) > 0) {
        return {
          healthy: false,
          message: 'Some reminders may not be sending',
          details: [
            `Overdue self-reminders: ${overdue_self_reminders}`,
            `Overdue vendor nudges: ${overdue_vendor_nudges}`
          ]
        };
      }
      
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: 'Failed to check reminder system', details: [error.message] };
    }
  }

  async checkAnomalies() {
    const anomalies = [];
    
    try {
      // Check for unusual patterns
      
      // 1. Too many emails in short time
      const emailSpike = await pool.query(`
        SELECT COUNT(*) as count FROM emails 
        WHERE created_at > NOW() - INTERVAL '1 hour'
      `);
      if (parseInt(emailSpike.rows[0].count) > 50) {
        anomalies.push({
          message: 'Unusual email activity',
          details: `${emailSpike.rows[0].count} emails saved in last hour`
        });
      }
      
      // 2. Check for threads with too many reminders
      const maxReminders = await pool.query(`
        SELECT subject, self_reminder_sent_count, vendor_reminder_sent_count
        FROM email_threads
        WHERE self_reminder_sent_count >= 5 OR vendor_reminder_sent_count >= 3
      `);
      if (maxReminders.rows.length > 0) {
        anomalies.push({
          message: 'Threads at max reminder limit',
          details: `${maxReminders.rows.length} thread(s) have reached reminder limits`
        });
      }
      
    } catch (error) {
      console.error('Error checking anomalies:', error);
    }
    
    return anomalies;
  }

  // ==================== ALERTS ====================

  async processAlerts(issues) {
    const criticalIssues = issues.filter(i => i.type === 'CRITICAL');
    const warningIssues = issues.filter(i => i.type === 'WARNING');
    
    // Send immediate alert for critical issues
    for (const issue of criticalIssues) {
      await this.sendAlert('CRITICAL', issue.message, issue.details);
    }
    
    // Send grouped alert for warnings (with cooldown)
    if (warningIssues.length > 0) {
      const warningKey = warningIssues.map(w => w.message).sort().join('|');
      if (!this.isInCooldown(warningKey)) {
        await this.sendAlert('WARNING', `${warningIssues.length} warning(s) detected`, 
          warningIssues.map(w => `• ${w.message}: ${JSON.stringify(w.details)}`).join('\n'));
        this.setCooldown(warningKey);
      }
    }
  }

  isInCooldown(alertKey) {
    const lastAlert = this.alertCooldowns.get(alertKey);
    if (!lastAlert) return false;
    
    const config = this.getConfig();
    const cooldownMs = config.alertCooldownMinutes * 60 * 1000;
    return (Date.now() - lastAlert) < cooldownMs;
  }

  setCooldown(alertKey) {
    this.alertCooldowns.set(alertKey, Date.now());
  }

  async sendAlert(severity, title, details) {
    try {
      const config = this.getConfig();
      
      // Get merchant credentials for sending email
      const merchantResult = await pool.query(
        'SELECT gmail_username, gmail_app_password, company_name FROM merchants WHERE is_active = true LIMIT 1'
      );
      
      if (merchantResult.rows.length === 0) {
        console.error('No active merchant found to send alert');
        return;
      }
      
      const merchant = merchantResult.rows[0];
      
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
      
      const severityEmoji = {
        'CRITICAL': '🚨',
        'WARNING': '⚠️',
        'INFO': 'ℹ️'
      };
      
      const severityColor = {
        'CRITICAL': '#dc2626',
        'WARNING': '#f59e0b',
        'INFO': '#3b82f6'
      };
      
      const mailOptions = {
        from: `Email Orchestrator Monitor <${merchant.gmail_username}>`,
        to: config.adminEmail,
        subject: `${severityEmoji[severity]} [${severity}] ${title} - Email Orchestrator`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: ${severityColor[severity]}; color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">${severityEmoji[severity]} ${severity} ALERT</h1>
              <p style="margin: 10px 0 0 0;">${title}</p>
            </div>
            <div style="padding: 20px; background: #f9fafb;">
              <h3>Details:</h3>
              <pre style="background: #1f2937; color: #e5e7eb; padding: 15px; border-radius: 8px; overflow-x: auto; white-space: pre-wrap;">${typeof details === 'string' ? details : JSON.stringify(details, null, 2)}</pre>
              
              <h3>System Status:</h3>
              <ul>
                <li>Time: ${new Date().toISOString()}</li>
                <li>Health Checks Performed: ${this.metrics.checksPerformed}</li>
                <li>Alerts Sent Today: ${this.metrics.alertsSent}</li>
              </ul>
              
              <p style="margin-top: 20px; color: #6b7280; font-size: 12px;">
                This is an automated alert from Email Orchestrator Monitoring Agent.<br>
                <a href="https://email-orchestrator-frontend.onrender.com/dashboard">Open Dashboard</a>
              </p>
            </div>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      this.metrics.alertsSent++;
      console.log(`🚨 Alert sent: [${severity}] ${title}`);
      
    } catch (error) {
      console.error('❌ Failed to send alert:', error.message);
    }
  }

  // ==================== DAILY REPORT ====================

  async sendDailyReport() {
    try {
      console.log('📊 Generating daily report...');
      
      const config = this.getConfig();
      
      // Gather statistics
      const stats = await this.gatherDailyStats();
      
      // Get merchant for sending
      const merchantResult = await pool.query(
        'SELECT gmail_username, gmail_app_password FROM merchants WHERE is_active = true LIMIT 1'
      );
      
      if (merchantResult.rows.length === 0) return;
      
      const merchant = merchantResult.rows[0];
      
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
      
      const healthEmoji = {
        'healthy': '✅',
        'warning': '⚠️',
        'critical': '🚨',
        'unknown': '❓'
      };
      
      const mailOptions = {
        from: `Email Orchestrator Monitor <${merchant.gmail_username}>`,
        to: config.adminEmail,
        subject: `📊 Daily Report - Email Orchestrator - ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
              <h1 style="margin: 0;">📊 Daily System Report</h1>
              <p style="margin: 10px 0 0 0;">${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            
            <div style="padding: 20px;">
              <h2>${healthEmoji[this.metrics.systemHealth]} System Health: ${this.metrics.systemHealth.toUpperCase()}</h2>
              
              <h3>📈 Statistics (Last 24 Hours)</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="background: #f3f4f6;">
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">Emails Processed</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${stats.emailsProcessed}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">New Threads Created</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${stats.newThreads}</td>
                </tr>
                <tr style="background: #f3f4f6;">
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">Self Reminders Sent</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${stats.selfRemindersSent}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">Vendor Nudges Sent</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${stats.vendorNudgesSent}</td>
                </tr>
                <tr style="background: #f3f4f6;">
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">Health Checks</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${this.metrics.checksPerformed}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #e5e7eb;">Alerts Sent</td>
                  <td style="padding: 10px; border: 1px solid #e5e7eb; font-weight: bold;">${this.metrics.alertsSent}</td>
                </tr>
              </table>
              
              <h3>📋 Current Thread Status</h3>
              <ul>
                <li>Waiting on Us: <strong>${stats.waitingOnUs}</strong></li>
                <li>Waiting on Vendor: <strong>${stats.waitingOnVendor}</strong></li>
                <li>Hot/Urgent: <strong>${stats.hotThreads}</strong></li>
                <li>Completed: <strong>${stats.completedThreads}</strong></li>
              </ul>
              
              ${stats.issues.length > 0 ? `
              <h3>⚠️ Issues Detected</h3>
              <ul>
                ${stats.issues.map(i => `<li>${i}</li>`).join('')}
              </ul>
              ` : '<p style="color: #10b981;">✅ No issues detected</p>'}
              
              <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
                <p style="margin: 0; color: #6b7280; font-size: 12px;">
                  <strong>Next Actions:</strong><br>
                  • Review any "Waiting on Us" threads<br>
                  • Check hot/urgent items<br>
                  • Monitor vendor response times
                </p>
              </div>
              
              <p style="margin-top: 20px; text-align: center;">
                <a href="https://email-orchestrator-frontend.onrender.com/dashboard" 
                   style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                  Open Dashboard
                </a>
              </p>
            </div>
          </div>
        `
      };
      
      await transporter.sendMail(mailOptions);
      console.log('📊 Daily report sent successfully');
      
      // Reset daily metrics
      this.metrics.alertsSent = 0;
      
    } catch (error) {
      console.error('❌ Failed to send daily report:', error.message);
    }
  }

  async gatherDailyStats() {
    try {
      const stats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM emails WHERE created_at > NOW() - INTERVAL '24 hours') as emails_processed,
          (SELECT COUNT(*) FROM email_threads WHERE created_at > NOW() - INTERVAL '24 hours') as new_threads,
          (SELECT COUNT(*) FROM email_threads WHERE status = 'waiting_on_us') as waiting_on_us,
          (SELECT COUNT(*) FROM email_threads WHERE status = 'waiting_on_vendor') as waiting_on_vendor,
          (SELECT COUNT(*) FROM email_threads WHERE is_hot = true) as hot_threads,
          (SELECT COUNT(*) FROM email_threads WHERE is_completed = true) as completed_threads,
          (SELECT SUM(COALESCE(self_reminder_sent_count, 0)) FROM email_threads WHERE updated_at > NOW() - INTERVAL '24 hours') as self_reminders,
          (SELECT SUM(COALESCE(vendor_reminder_sent_count, 0)) FROM email_threads WHERE updated_at > NOW() - INTERVAL '24 hours') as vendor_nudges
      `);
      
      const row = stats.rows[0];
      
      return {
        emailsProcessed: row.emails_processed || 0,
        newThreads: row.new_threads || 0,
        waitingOnUs: row.waiting_on_us || 0,
        waitingOnVendor: row.waiting_on_vendor || 0,
        hotThreads: row.hot_threads || 0,
        completedThreads: row.completed_threads || 0,
        selfRemindersSent: row.self_reminders || 0,
        vendorNudgesSent: row.vendor_nudges || 0,
        issues: this.metrics.issuesFound.map(i => `[${i.type}] ${i.message}`)
      };
    } catch (error) {
      console.error('Error gathering stats:', error);
      return {
        emailsProcessed: 0, newThreads: 0, waitingOnUs: 0, waitingOnVendor: 0,
        hotThreads: 0, completedThreads: 0, selfRemindersSent: 0, vendorNudgesSent: 0,
        issues: ['Failed to gather statistics']
      };
    }
  }

  // ==================== STATUS API ====================

  getStatus() {
    return {
      isRunning: this.checkInterval !== null,
      metrics: this.metrics,
      config: this.getConfig(),
      lastCheck: this.metrics.lastCheck,
      systemHealth: this.metrics.systemHealth,
      issuesCount: this.metrics.issuesFound.length
    };
  }
}

// Create singleton instance
const monitoringAgent = new MonitoringAgent();

export default monitoringAgent;