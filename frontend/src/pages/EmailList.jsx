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
        setSuccess(response.message);
        // Refresh threads after fetch
        fetchThreads();
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch emails');
    } finally {
      setFetching(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'waiting_on_us': 'bg-orange-100 text-orange-800',
      'waiting_on_vendor': 'bg-blue-100 text-blue-800',
      'completed': 'bg-green-100 text-green-800',
      'snoozed': 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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

  const getGatewayColor = (gateway) => {
    const colors = {
      'razorpay': 'bg-blue-100 text-blue-800',
      'payu': 'bg-green-100 text-green-800',
      'cashfree': 'bg-purple-100 text-purple-800',
      'paytm': 'bg-indigo-100 text-indigo-800',
      'virtualpay': 'bg-pink-100 text-pink-800'
    };
    return colors[gateway] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // Less than 1 hour
    if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins} min${mins !== 1 ? 's' : ''} ago`;
    }
    
    // Less than 24 hours
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    
    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
    
    // Show actual date
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading emails...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold text-gray-900">
              Email Threads: {merchant?.company_name}
            </h1>
            <div className="flex gap-4">
              <button
                onClick={handleFetchEmails}
                disabled={fetching}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {fetching ? '⏳ Fetching...' : '📧 Fetch New Emails'}
              </button>
              <button
                onClick={() => navigate('/merchants')}
                className="text-gray-600 hover:text-gray-900"
              >
                ← Back to Merchants
              </button>
            </div>
          </div>
          <div className="text-sm text-gray-500">
            Gmail: {merchant?.gmail_username}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 border border-green-400 text-green-700 rounded">
            {success}
          </div>
        )}

        {threads.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600 mb-4">No email threads found</p>
            <button
              onClick={handleFetchEmails}
              disabled={fetching}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
            >
              {fetching ? 'Fetching...' : 'Fetch Emails from Gmail'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {threads.map((thread) => (
              <div
                key={thread.id}
                onClick={() => navigate(`/thread/${thread.id}`)}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {thread.subject}
                    </h3>
                    <div className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">{thread.vendor_name}</span>
                      {' '}&lt;{thread.vendor_email}&gt;
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getGatewayColor(thread.gateway)}`}>
                      {thread.gateway}
                    </span>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(thread.status)}`}>
                      {getStatusLabel(thread.status)}
                    </span>
                    {thread.is_hot && (
                      <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                        🔥 Hot
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm text-gray-500">
                  <div>
                    Last activity: <span className="font-medium">{formatDate(thread.last_activity_at)}</span>
                  </div>
                  <div>
                    Last actor: <span className="font-medium capitalize">{thread.last_actor}</span>
                  </div>
                </div>

                {thread.vendor_followup_count > 0 && (
                  <div className="mt-2 text-sm text-orange-600">
                    ⚠️ {thread.vendor_followup_count} follow-up{thread.vendor_followup_count !== 1 ? 's' : ''} sent
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default EmailList;