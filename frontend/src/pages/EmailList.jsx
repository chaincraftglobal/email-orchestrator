import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { emailAPI, merchantAPI } from '../services/api';

function EmailList() {
  const navigate = useNavigate();
  const { merchantId } = useParams();
  const [merchant, setMerchant] = useState(null);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchMerchantData();
    fetchThreads();
  }, [merchantId]);

  const fetchMerchantData = async () => {
    try {
      const response = await merchantAPI.getById(merchantId);
      if (response.success) {
        setMerchant(response.merchant);
      }
    } catch (err) {
      console.error('Failed to load merchant:', err);
    }
  };

  const fetchThreads = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getMerchantThreads(merchantId);
      if (response.success) {
        setThreads(response.threads);
      }
    } catch (err) {
      setError('Failed to load email threads');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchEmails = async () => {
    try {
      setFetching(true);
      setError('');
      setSuccess('');
      
      const response = await emailAPI.fetchEmails(merchantId);
      
      if (response.success) {
        setSuccess(`✅ ${response.message} - Found ${response.data.newEmails} new emails in ${response.data.newThreads} threads`);
        setTimeout(() => fetchThreads(), 1000);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch emails');
    } finally {
      setFetching(false);
    }
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

  const getStatusLabel = (status) => {
    const labels = {
      'waiting_on_us': 'Waiting on Us',
      'waiting_on_vendor': 'Waiting on Vendor',
      'completed': 'Completed',
      'snoozed': 'Snoozed'
    };
    return labels[status] || status;
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  if (loading && threads.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading email threads...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <button
                onClick={() => navigate('/merchants')}
                className="text-blue-600 hover:text-blue-800 mb-2 flex items-center gap-2"
              >
                ← Back to Merchants
              </button>
              <h1 className="text-3xl font-bold text-gray-900">
                Email Threads: {merchant?.company_name}
              </h1>
              {merchant && (
                <p className="text-sm text-gray-600 mt-1">
                  Gmail: {merchant.gmail_username}
                </p>
              )}
            </div>
            
            <button
              onClick={handleFetchEmails}
              disabled={fetching}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              {fetching ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Fetching...
                </>
              ) : (
                <>
                  <span>📧</span>
                  Fetch New Emails
                </>
              )}
            </button>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
              {success}
            </div>
          )}
          {error && (
            <div className="mt-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Thread List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {threads.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No email threads found</h2>
            <p className="text-gray-600 mb-6">Click "Fetch New Emails" to check for gateway emails</p>
            <button
              onClick={handleFetchEmails}
              disabled={fetching}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition duration-200 disabled:opacity-50"
            >
              {fetching ? 'Fetching...' : '📧 Fetch Emails'}
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {threads.map((thread) => {
              const gatewayBadge = getGatewayBadge(thread.gateway);
              
              return (
                <div
                  key={thread.id}
                  onClick={() => navigate(`/thread/${thread.id}`)}
                  className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer border border-gray-200 hover:border-blue-400 overflow-hidden"
                >
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2 hover:text-blue-600">
                          {thread.subject}
                        </h3>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">{thread.vendor_name}</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-500">{thread.vendor_email}</span>
                        </div>
                      </div>
                      
                      {thread.is_hot && (
                        <span className="ml-4 px-3 py-1 bg-red-100 text-red-800 text-sm font-bold rounded-full flex items-center gap-1">
                          🔥 Hot
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${gatewayBadge.bg} ${gatewayBadge.text}`}>
                        {gatewayBadge.label}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(thread.status)}`}>
                        {getStatusLabel(thread.status)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-sm text-gray-500">
                      <div className="flex gap-4">
                        <span>Last activity: <strong className="text-gray-700">{formatDate(thread.last_activity_at)}</strong></span>
                        <span>•</span>
                        <span>Last actor: <strong className="text-gray-700">{thread.last_actor === 'vendor' ? 'Vendor' : 'Us'}</strong></span>
                      </div>
                      <span className="text-blue-600 font-medium">View Thread →</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailList;
