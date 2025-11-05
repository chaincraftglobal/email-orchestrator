import axios from 'axios';

// Base URL for API (change to your backend URL)
const API_BASE_URL = 'http://localhost:5001/api';

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
  // Login
  login: async (username, password) => {
    const response = await api.post('/auth/login', { username, password });
    return response.data;
  },
  
  // Verify token
  verifyToken: async () => {
    const response = await api.get('/auth/verify');
    return response.data;
  },
};

// Merchant API calls
export const merchantAPI = {
  // Get all merchants
  getAll: async () => {
    const response = await api.get('/merchants');
    return response.data;
  },
  
  // Get single merchant by ID
  getById: async (id) => {
    const response = await api.get(`/merchants/${id}`);
    return response.data;
  },
  
  // Test Gmail connection
  testGmail: async (gmail_username, gmail_app_password) => {
    const response = await api.post('/merchants/test-gmail', {
      gmail_username,
      gmail_app_password
    });
    return response.data;
  },
  
  // Create new merchant
  create: async (merchantData) => {
    const response = await api.post('/merchants', merchantData);
    return response.data;
  },
  
  // Update merchant
  update: async (id, merchantData) => {
    const response = await api.put(`/merchants/${id}`, merchantData);
    return response.data;
  },
  
  // Delete merchant
  delete: async (id) => {
    const response = await api.delete(`/merchants/${id}`);
    return response.data;
  },
};

// Email API calls
export const emailAPI = {
  // Fetch emails from Gmail for a merchant
  fetchEmails: async (merchantId) => {
    const response = await api.post(`/emails/fetch/${merchantId}`);
    return response.data;
  },
  
  // Get all emails for a merchant
  getMerchantEmails: async (merchantId) => {
    const response = await api.get(`/emails/merchant/${merchantId}`);
    return response.data;
  },
  
  // Get all threads for a merchant
  getMerchantThreads: async (merchantId) => {
    const response = await api.get(`/emails/threads/${merchantId}`);
    return response.data;
  },
  
  // Get all emails in a specific thread
  getThreadEmails: async (threadId) => {
    const response = await api.get(`/emails/thread/${threadId}`);
    return response.data;
  },
};

// Scheduler API calls
export const schedulerAPI = {
  // Start scheduler for all merchants
  start: async () => {
    const response = await api.post('/scheduler/start');
    return response.data;
  },
  
  // Stop scheduler for all merchants
  stop: async () => {
    const response = await api.post('/scheduler/stop');
    return response.data;
  },
  
  // Get scheduler status
  getStatus: async () => {
    const response = await api.get('/scheduler/status');
    return response.data;
  },
  
  // Restart scheduler
  restart: async () => {
    const response = await api.post('/scheduler/restart');
    return response.data;
  },
  
  // Start scheduler for specific merchant
  startMerchant: async (merchantId) => {
    const response = await api.post(`/scheduler/merchant/${merchantId}/start`);
    return response.data;
  },
  
  // Stop scheduler for specific merchant
  stopMerchant: async (merchantId) => {
    const response = await api.post(`/scheduler/merchant/${merchantId}/stop`);
    return response.data;
  },
};

export default api;