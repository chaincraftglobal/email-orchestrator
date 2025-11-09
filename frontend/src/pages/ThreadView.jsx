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
      'waiting_on_us': 'bg-orange-100 text-orange-700',
      'waiting_on_vendor': 'bg-blue-100 text-blue-700',
      'completed': 'bg-green-100 text-green-700',
      'snoozed': 'bg-gray-100 text-gray-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
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
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    // Gmail-style date formatting
    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / 60000);
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
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
      <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: 'Roboto, Arial, sans-serif' }}>
        <div className="text-gray-600 text-base">Loading thread...</div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" style={{ fontFamily: 'Roboto, Arial, sans-serif' }}>
        <div className="text-center">
          <p className="text-red-600 mb-4 text-base">{error || 'Thread not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'Roboto, Arial, sans-serif' }}>
      {/* Header - Gmail style */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate(`/emails/${thread.merchant_id}`)}
            className="text-gray-600 hover:text-gray-900 text-sm font-medium mb-4 inline-flex items-center gap-1"
          >
            <span className="text-lg">←</span> Back to Threads
          </button>

          <div className="flex items-start justify-between mb-3">
            <h1 className="text-xl font-normal text-gray-900 leading-7" style={{ fontSize: '22px' }}>
              {thread.subject}
            </h1>
          </div>

          {/* Thread Meta */}
          <div className="flex gap-2 items-center flex-wrap">
            <span className="px-3 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {getGatewayName(thread.gateway)}
            </span>
            <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(thread.status)} border`}>
              {getStatusLabel(thread.status)}
            </span>
            {thread.is_hot && (
              <span className="px-3 py-1 text-xs font-medium rounded-full bg-red-50 text-red-700 border border-red-200">
                🔥 Hot
              </span>
            )}
            <span className="text-xs text-gray-500">
              Last actor: <span className="font-medium text-gray-700 capitalize">{thread.last_actor}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Email Thread - Gmail style */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="space-y-2">
          {emails.map((email, index) => (
            <div
              key={email.id}
              className="bg-white border border-gray-200 rounded-lg hover:shadow-md transition-shadow duration-200"
              style={{ boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)' }}
            >
              {/* Email Card */}
              <div className="p-5">
                {/* Email Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-start gap-3 flex-1">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                      {email.direction === 'outbound' 
                        ? 'You'[0] 
                        : (email.from_name || email.from_email)[0].toUpperCase()
                      }
                    </div>
                    
                    {/* Sender Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-1">
                        <span className="font-medium text-gray-900 text-sm">
                          {email.direction === 'outbound' ? 'You' : (email.from_name || 'Unknown Sender')}
                        </span>
                        {email.direction === 'outbound' && (
                          <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                            ➡️ Sent
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 leading-relaxed">
                        <div className="mb-0.5">
                          <span className="text-gray-500">to </span>
                          {email.to_emails && Array.isArray(email.to_emails) 
                            ? email.to_emails.map(t => t.address || t).join(', ')
                            : 'recipients'
                          }
                        </div>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="text-xs text-gray-500 flex-shrink-0">
                      {formatDate(email.email_date)}
                    </div>
                  </div>
                </div>

                {/* Email Body */}
                <div 
                  className="text-sm text-gray-800 leading-relaxed ml-13 whitespace-pre-wrap"
                  style={{ 
                    lineHeight: '1.6',
                    fontSize: '14px',
                    color: '#202124'
                  }}
                >
                  {email.body_text || email.snippet || 'No content'}
                </div>

                {/* Attachments */}
                {email.has_attachments && email.attachments && email.attachments.length > 0 && (
                  <div className="mt-4 ml-13 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                      <span>📎</span>
                      <span className="font-medium">{email.attachments.length} attachment{email.attachments.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="space-y-1">
                      {email.attachments.map((att, idx) => (
                        <div 
                          key={idx} 
                          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 mr-2"
                        >
                          <span>📄</span>
                          <span>{att.filename}</span>
                          <span className="text-gray-500">({Math.round(att.size / 1024)} KB)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {emails.length === 0 && (
          <div className="text-center py-16">
            <div className="text-gray-400 text-5xl mb-4">📭</div>
            <p className="text-gray-600 text-base">No emails in this thread</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default ThreadView;