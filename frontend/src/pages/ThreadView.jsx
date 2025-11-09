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

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / 60000);
      return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
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
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Loading thread...</div>
      </div>
    );
  }

  if (error || !thread) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error || 'Thread not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white" style={{ 
      fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
    }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate(`/emails/${thread.merchant_id}`)}
            className="text-gray-700 hover:text-gray-900 text-sm font-medium mb-4 inline-flex items-center gap-2"
          >
            <span>←</span> Back to Threads
          </button>

          <h1 className="text-xl font-normal text-gray-900 mb-3" style={{ fontSize: '22px' }}>
            {thread.subject}
          </h1>

          <div className="flex gap-2 items-center flex-wrap">
            <span className="px-2.5 py-1 text-xs font-medium rounded bg-blue-50 text-blue-700">
              {getGatewayName(thread.gateway)}
            </span>
            <span className={`px-2.5 py-1 text-xs font-medium rounded ${getStatusColor(thread.status)}`}>
              {getStatusLabel(thread.status)}
            </span>
            {thread.is_hot && (
              <span className="px-2.5 py-1 text-xs font-medium rounded bg-red-50 text-red-700">
                🔥 Hot
              </span>
            )}
            <span className="text-xs text-gray-500">
              Last actor: <span className="font-medium capitalize">{thread.last_actor}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Email Messages */}
      <main className="max-w-4xl mx-auto px-6 py-4">
        <div className="space-y-0">
          {emails.map((email, index) => (
            <div key={email.id} className="py-4 border-b border-gray-100 last:border-b-0">
              {/* Email Header */}
              <div className="flex items-start gap-3 mb-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium text-base flex-shrink-0">
                  {email.direction === 'outbound' 
                    ? 'Y' 
                    : (email.from_name || email.from_email)[0].toUpperCase()
                  }
                </div>
                
                {/* Sender and Date */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 text-sm">
                        {email.direction === 'outbound' ? 'You' : (email.from_name || 'Unknown')}
                      </span>
                      {email.direction === 'outbound' && (
                        <span className="text-xs text-gray-500">
                          ➡️ Sent
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0 ml-4">
                      {formatDate(email.email_date)}
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-600">
                    to {email.to_emails && Array.isArray(email.to_emails) 
                      ? email.to_emails.map(t => t.address || t).join(', ')
                      : 'recipients'
                    }
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="ml-13 pl-0">
                <div 
                  className="whitespace-pre-wrap"
                  style={{ 
                    margin: '16px 0',
                    color: 'rgb(15, 17, 21)',
                    fontSize: '16px',
                    lineHeight: '1.5',
                    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif'
                  }}
                >
                  {email.body_text || email.snippet || 'No content'}
                </div>

                {/* Attachments */}
                {email.has_attachments && email.attachments && email.attachments.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <span>📎</span>
                      <span>{email.attachments.length} attachment{email.attachments.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {email.attachments.map((att, idx) => (
                        <div 
                          key={idx} 
                          className="inline-flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm"
                        >
                          <span>📄</span>
                          <span className="text-gray-700">{att.filename}</span>
                          <span className="text-gray-500 text-xs">({Math.round(att.size / 1024)} KB)</span>
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
            <div className="text-gray-300 text-5xl mb-4">📭</div>
            <p className="text-gray-600">No emails in this thread</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default ThreadView;