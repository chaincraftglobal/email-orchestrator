import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token || !userData) {
      // Not logged in, redirect to login
      navigate('/');
      return;
    }

    // Set user data
    setUser(JSON.parse(userData));
  }, [navigate]);

  const handleLogout = () => {
    // Clear token and user data
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Redirect to login
    navigate('/');
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">
            Email Orchestrator Dashboard
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">
              Welcome, <strong>{user.username}</strong>
            </span>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition duration-200"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => navigate('/merchants')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200 text-left"
            >
              <div className="text-2xl mb-1">📋</div>
              <div className="font-bold">View All Merchants</div>
              <div className="text-sm opacity-90">Manage merchant accounts</div>
            </button>
            
            <button
              onClick={() => navigate('/add-merchant')}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200 text-left"
            >
              <div className="text-2xl mb-1">➕</div>
              <div className="font-bold">Add New Merchant</div>
              <div className="text-sm opacity-90">Connect Gmail account</div>
            </button>
            
            <button
              onClick={() => navigate('/scheduler')}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-semibold transition duration-200 text-left"
            >
              <div className="text-2xl mb-1">⏰</div>
              <div className="font-bold">Email Scheduler</div>
              <div className="text-sm opacity-90">Control background jobs</div>
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">Total Merchants</h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">0</p>
            <p className="text-sm text-gray-500 mt-2">Active accounts</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">Pending Replies</h3>
            <p className="text-3xl font-bold text-orange-600 mt-2">0</p>
            <p className="text-sm text-gray-500 mt-2">Awaiting response</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">Emails Checked Today</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">0</p>
            <p className="text-sm text-gray-500 mt-2">Total processed</p>
          </div>
          
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-gray-500 text-sm font-medium">Overdue Reminders</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">0</p>
            <p className="text-sm text-gray-500 mt-2">Need attention</p>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-2">
            Getting Started
          </h3>
          <ul className="text-blue-800 space-y-2">
            <li>✅ Login successful - You're all set!</li>
            <li>➡️ Step 1: Add your first merchant account</li>
            <li>📧 Step 2: Configure Gmail credentials and select payment gateways</li>
            <li>⏰ Step 3: Start the email scheduler for automatic checking</li>
            <li>🔔 Step 4: Set reminder preferences for automated follow-ups</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default Dashboard;