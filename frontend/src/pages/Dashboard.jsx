import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { merchantAPI } from '../services/api';
import authService from '../services/authService';
import LogoutButton from '../components/LogoutButton';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    totalMerchants: 0,
    pendingReplies: 0,
    emailsCheckedToday: 0,
    overdueReminders: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    fetchStats();
  }, []);

  const checkAuth = () => {
    if (!authService.isAuthenticated()) {
      navigate('/');
      return;
    }
    const userData = authService.getUser();
    setUser(userData);
  };

  const fetchStats = async () => {
    try {
      const response = await merchantAPI.getAll();
      if (response.success) {
        const merchants = response.merchants;
        
        setStats({
          totalMerchants: merchants.length,
          activeMerchants: merchants.filter(m => m.is_active).length,
          pendingReplies: 0, // Will calculate from threads
          emailsCheckedToday: merchants.filter(m => {
            if (!m.last_email_check) return false;
            const lastCheck = new Date(m.last_email_check);
            const today = new Date();
            return lastCheck.toDateString() === today.toDateString();
          }).length,
          overdueReminders: 0 // Will calculate from threads
        });
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Email Orchestrator
            </h1>
            <p className="text-sm text-gray-600 mt-1">Payment Gateway Onboarding Manager</p>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-gray-700">
              Welcome, <strong className="text-blue-600">{user.username}</strong>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Total Merchants</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{stats.totalMerchants}</p>
                <p className="text-sm text-gray-500 mt-1">{stats.activeMerchants} active</p>
              </div>
              <div className="text-5xl">🏢</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Pending Replies</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{stats.pendingReplies}</p>
                <p className="text-sm text-gray-500 mt-1">Awaiting response</p>
              </div>
              <div className="text-5xl">⏳</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Emails Checked Today</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{stats.emailsCheckedToday}</p>
                <p className="text-sm text-gray-500 mt-1">Total processed</p>
              </div>
              <div className="text-5xl">✅</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-red-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Overdue Reminders</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{stats.overdueReminders}</p>
                <p className="text-sm text-gray-500 mt-1">Need attention</p>
              </div>
              <div className="text-5xl">🔥</div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => navigate('/merchants')}
              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white p-6 rounded-lg font-semibold text-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-3"
            >
              <span className="text-3xl">👥</span>
              View All Merchants
            </button>
            
            <button
              onClick={() => navigate('/add-merchant')}
              className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white p-6 rounded-lg font-semibold text-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-3"
            >
              <span className="text-3xl">➕</span>
              Add New Merchant
            </button>
            
            <button
              onClick={() => navigate('/scheduler')}
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white p-6 rounded-lg font-semibold text-lg transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center gap-3"
            >
              <span className="text-3xl">⏰</span>
              Email Scheduler
            </button>
          </div>
        </div>

        {/* Getting Started */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-8 border border-indigo-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">🚀 Getting Started</h2>
          <div className="space-y-3 text-gray-700">
            <p className="flex items-start gap-3">
              <span className="text-2xl">1️⃣</span>
              <span><strong>Add a merchant</strong> with Gmail credentials and select payment gateways to monitor</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-2xl">2️⃣</span>
              <span><strong>Fetch emails</strong> to check for payment gateway onboarding messages</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-2xl">3️⃣</span>
              <span><strong>Start the scheduler</strong> to automatically monitor emails and send reminders</span>
            </p>
            <p className="flex items-start gap-3">
              <span className="text-2xl">4️⃣</span>
              <span><strong>Track threads</strong> in the email viewer to see all conversations with vendors</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
