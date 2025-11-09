cd /Users/dipakbhosale/Projects/email-orchestrator/frontend/src/pages

cat > Dashboard.jsx << 'EOF'
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { merchantAPI, emailAPI } from '../services/api';
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
  const [recentThreads, setRecentThreads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    fetchStats();
    fetchRecentThreads();
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
          pendingReplies: 0,
          emailsCheckedToday: merchants.filter(m => {
            if (!m.last_email_check) return false;
            const lastCheck = new Date(m.last_email_check);
            const today = new Date();
            return lastCheck.toDateString() === today.toDateString();
          }).length,
          overdueReminders: 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentThreads = async () => {
    try {
      const response = await emailAPI.getRecentThreads(10);
      if (response.success) {
        setRecentThreads(response.threads);
      }
    } catch (err) {
      console.error('Failed to fetch recent threads:', err);
    }
  };

  const getGatewayBadge = (gateway) => {
    const badges = {
      'razorpay': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Razorpay' },
      'payu': { bg: 'bg-green-100', text: 'text-green-800', label: 'PayU' },
      'cashfree': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Cashfree' },
      'paytm': { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Paytm' },
      'virtualpay': { bg: 'bg-pink-100', text: 'text-pink-800', label: 'VirtualPay' }
    };
    return badges[gateway] || { bg: 'bg-gray-100', text: 'text-gray-800', label: gateway };
  };

  const getStatusColor = (status) => {
    const colors = {
      'waiting_on_us': 'bg-orange-500 text-white',
      'waiting_on_vendor': 'bg-blue-500 text-white',
      'completed': 'bg-green-500 text-white',
      'snoozed': 'bg-gray-500 text-white'
    };
    return colors[status] || 'bg-gray-500 text-white';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
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
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Email Threads</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{recentThreads.length}</p>
                <p className="text-sm text-gray-500 mt-1">Active conversations</p>
              </div>
              <div className="text-5xl">💬</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Checked Today</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">{stats.emailsCheckedToday}</p>
                <p className="text-sm text-gray-500 mt-1">Merchants synced</p>
              </div>
              <div className="text-5xl">✅</div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 uppercase tracking-wide">Waiting on Us</p>
                <p className="text-4xl font-bold text-gray-900 mt-2">
                  {recentThreads.filter(t => t.status === 'waiting_on_us').length}
                </p>
                <p className="text-sm text-gray-500 mt-1">Need reply</p>
              </div>
              <div className="text-5xl">⏳</div>
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

        {/* Recent Email Threads */}
        <div className="bg-white rounded-xl shadow-md p-8 mb-12">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">📬 Latest Email Threads</h2>
            <button
              onClick={() => navigate('/merchants')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              View All Merchants →
            </button>
          </div>
          
          {recentThreads.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📭</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">No email threads yet</h2>
              <p className="text-gray-600 mb-6">Click "Fetch New Emails" to check for gateway emails</p>
              <button
                onClick={() => navigate('/merchants')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
              >
                Add Merchant & Fetch Emails
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {recentThreads.map((thread) => {
                const gatewayBadge = getGatewayBadge(thread.gateway);
                
                return (
                  <div
                    key={thread.id}
                    onClick={() => navigate(`/thread/${thread.id}`)}
                    className="p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all cursor-pointer bg-gray-50 hover:bg-white"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${gatewayBadge.bg} ${gatewayBadge.text}`}>
                            {gatewayBadge.label}
                          </span>
                          <span className="text-sm font-medium text-gray-600">
                            {thread.merchant_name}
                          </span>
                          {thread.is_hot && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded">
                              🔥 Hot
                            </span>
                          )}
                        </div>
                        <h4 className="font-semibold text-gray-900 mb-1 hover:text-blue-600">
                          {thread.subject}
                        </h4>
                        <p className="text-sm text-gray-600">
                          {thread.vendor_name} • {formatDate(thread.last_activity_at)}
                        </p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(thread.status)}`}>
                        {thread.status === 'waiting_on_us' ? 'Reply Needed' : 'Waiting on Vendor'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
              <span><strong>Click any thread above</strong> to view the full conversation and reply</span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;
EOF