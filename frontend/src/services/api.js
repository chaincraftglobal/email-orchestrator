import axios from 'axios';

// Hardcoded production URL (bypasses .env files)
const PRODUCTION_API_URL = 'https://email-orchestrator-production.up.railway.app/api';
const DEVELOPMENT_API_URL = 'http://localhost:5001/api';

// Detect if we're in production by checking the hostname
const isProduction = typeof window !== 'undefined' && 
  (window.location.hostname === 'email-orchestrator-ten.vercel.app' || 
   window.location.hostname.includes('.vercel.app'));

// Use production URL if on Vercel, otherwise localhost
const API_BASE_URL = isProduction ? PRODUCTION_API_URL : DEVELOPMENT_API_URL;

// Debug logging
console.log('🌍 Hostname:', typeof window !== 'undefined' ? window.location.hostname : 'server');
console.log('🔧 Is Production:', isProduction);
console.log('🔗 API Base URL:', API_BASE_URL);

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if it exists
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  },
  
  verifyToken: async () => {
    const response = await api.get('/auth/verify');
    return response.data;
  },
};

// Merchant API calls
export const merchantAPI = {
  getAll: async () => {
    const response = await api.get('/merchants');
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/merchants/${id}`);
    return response.data;
  },
  
  testGmail: async (gmail_username, gmail_app_password) => {
    const response = await api.post('/merchants/test-gmail', {
      gmail_username,
      gmail_app_password
    });
    return response.data;
  },
  
  create: async (merchantData) => {
    const response = await api.post('/merchants', merchantData);
    return response.data;
  },
  
  update: async (id, merchantData) => {
    const response = await api.put(`/merchants/${id}`, merchantData);
    return response.data;
  },
  
  delete: async (id) => {
    const response = await api.delete(`/merchants/${id}`);
    return response.data;
  },
};

// Email API calls
export const emailAPI = {
  fetchEmails: async (merchantId) => {
    const response = await api.post(`/emails/fetch/${merchantId}`);
    return response.data;
  },
  
  getMerchantEmails: async (merchantId) => {
    const response = await api.get(`/emails/merchant/${merchantId}`);
    return response.data;
  },
  
  getMerchantThreads: async (merchantId) => {
    const response = await api.get(`/emails/threads/${merchantId}`);
    return response.data;
  },
  
  getThreadEmails: async (threadId) => {
    const response = await api.get(`/emails/thread/${threadId}`);
    return response.data;
  },
  
  // Get recent threads across all merchants
  getRecentThreads: async (limit = 10) => {
    const response = await api.get(`/emails/recent?limit=${limit}`);
    return response.data;
  },
};

// Scheduler API calls
export const schedulerAPI = {
  start: async () => {
    const response = await api.post('/scheduler/start');
    return response.data;
  },
  
  stop: async () => {
    const response = await api.post('/scheduler/stop');
    return response.data;
  },
  
  getStatus: async () => {
    const response = await api.get('/scheduler/status');
    return response.data;
  },
  
  restart: async () => {
    const response = await api.post('/scheduler/restart');
    return response.data;
  },
  
  startMerchant: async (merchantId) => {
    const response = await api.post(`/scheduler/merchant/${merchantId}/start`);
    return response.data;
  },
  
  stopMerchant: async (merchantId) => {
    const response = await api.post(`/scheduler/merchant/${merchantId}/stop`);
    return response.data;
  },
};

export default api;