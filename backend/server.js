import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database.js';
import reminderChecker from './services/reminderChecker.js';
import monitoringAgent from './services/monitoringAgent.js';
import authRoutes from './routes/authRoutes.js';
import merchantRoutes from './routes/merchantRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import schedulerRoutes from './routes/schedulerRoutes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('🔍 OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Email Orchestrator Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Monitoring Agent endpoints
app.get('/api/monitor/status', (req, res) => {
  try {
    const status = monitoringAgent.getStatus();
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get monitor status' });
  }
});

app.post('/api/monitor/check', async (req, res) => {
  try {
    await monitoringAgent.performHealthCheck();
    res.json({ success: true, message: 'Health check completed', status: monitoringAgent.getStatus() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Health check failed' });
  }
});

app.post('/api/monitor/report', async (req, res) => {
  try {
    await monitoringAgent.sendDailyReport();
    res.json({ success: true, message: 'Daily report sent' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to send daily report' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/merchants', merchantRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/scheduler', schedulerRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Connected to PostgreSQL database');
  })
  .catch(err => {
    console.error('❌ Database connection error:', err.message);
  });

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 Auth endpoint: http://localhost:${PORT}/api/auth/login`);
  console.log(`📦 Merchants endpoint: http://localhost:${PORT}/api/merchants`);
  console.log(`📧 Emails endpoint: http://localhost:${PORT}/api/emails`);
  console.log(`⏰ Scheduler endpoint: http://localhost:${PORT}/api/scheduler`);
  console.log(`🤖 Monitor endpoint: http://localhost:${PORT}/api/monitor/status`);
  
  setTimeout(() => {
    console.log('\n🎬 Starting automated systems...');
    reminderChecker.start();
    console.log('✅ Reminder checker started!');
    monitoringAgent.start();
    console.log('✅ Monitoring agent started!\n');
  }, 3000);
});