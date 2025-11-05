import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { emailAPI } from '../services/api';

function ThreadView() {
  const navigate = useNavigate();
  const { threadId } = useParams();
  const [thread, setThread] = useState(null);
  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchThread();
  }, [threadId]);

  const fetchThread = async () => {
    try {
      setLoading(true);
      const response = await emailAPI.getThreadEmails(threadId);
      if (response.success) {
        setThread(response.thread);
        setEmails(response.emails);
      }
    } catch (err) {
      setError('Failed to load thread');
      console.error(err);
    } finally {
      setLoading(false);
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const getGatewayName = (gateway) => {
    const names = {
      'razorpay': 'Razorpay',
      'payu': 'PayU',
      'cashfree': 'Cashfree',
      'paytm': 'Paytm',
      'virtualpay': 'Virtual Pay'
    };
    return names[gateway] || gateway;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading thread...</div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Thread not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {thread.subject}
              </h1>
              <div className="text-sm text-gray-600">
                <span className="font-medium">{thread.vendor_name}</span>
                {' '}&lt;{thread.vendor_email}&gt;
              </div>
            </div>
            <button
              onClick={() => navigate(`/emails/${thread.merchant_id}`)}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Threads
            </button>
          </div>

          {/* Thread Info */}
          <div className="flex gap-3 items-center">
            <span className="px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800">
              {getGatewayName(thread.gateway)}
            </span>
            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(thread.status)}`}>
              {getStatusLabel(thread.status)}
            </span>
            {thread.is_hot && (
              <span className="px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                🔥 Hot
              </span>
            )}
            <span className="text-sm text-gray-500">
              Last actor: <span className="font-medium capitalize">{thread.last_actor}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-4">
          {emails.map((email) => (
            <div
              key={email.id}
              className={`flex ${email.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-3xl w-full rounded-lg shadow-md p-6 ${
                  email.direction === 'outbound'
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : 'bg-white border-l-4 border-gray-300'
                }`}
              >
                {/* Email Header */}
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {email.direction === 'outbound' ? 'You' : email.from_name || email.from_email}
                    </div>
                    <div className="text-sm text-gray-600">
                      {email.from_email}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {formatDate(email.email_date)}
                  </div>
                </div>

                {/* To/CC */}
                {email.to_emails && email.to_emails.length > 0 && (
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">To:</span> {email.to_emails.map(t => t.address || t).join(', ')}
                  </div>
                )}

                {email.cc_emails && email.cc_emails.length > 0 && (
                  <div className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">CC:</span> {email.cc_emails.map(c => c.address || c).join(', ')}
                  </div>
                )}

                {/* Email Body */}
                <div className="mt-4 text-gray-800 whitespace-pre-wrap border-t border-gray-200 pt-4">
                  {email.body_text || email.snippet || 'No content'}
                </div>

                {/* Attachments */}
                {email.has_attachments && email.attachments && email.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      📎 Attachments ({email.attachments.length}):
                    </div>
                    <div className="space-y-1">
                      {email.attachments.map((att, idx) => (
                        <div key={idx} className="text-sm text-gray-600">
                          • {att.filename} ({Math.round(att.size / 1024)} KB)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direction Badge */}
                <div className="mt-4 pt-3 border-t border-gray-200">
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded ${
                      email.direction === 'outbound'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {email.direction === 'outbound' ? '➡️ Sent' : '⬅️ Received'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {emails.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No emails in this thread</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default ThreadView;