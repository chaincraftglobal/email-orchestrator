import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { merchantAPI, emailAPI } from '../services/api';

function Merchants() {
  const navigate = useNavigate();
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [fetchingEmails, setFetchingEmails] = useState(null);
  const [testingEmail, setTestingEmail] = useState(null);

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    try {
      setLoading(true);
      const response = await merchantAPI.getAll();
      if (response.success) {
        setMerchants(response.merchants);
      }
    } catch (err) {
      setError('Failed to load merchants');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchEmails = async (e, merchantId, companyName) => {
    e.stopPropagation(); // Prevent row click
    try {
      setFetchingEmails(merchantId);
      setError('');
      setSuccess('');
      
      const response = await emailAPI.fetchEmails(merchantId);
      
      if (response.success) {
        const data = response.data || {};
        setSuccess(`✅ ${companyName}: Found ${data.newEmails || 0} new emails in ${data.newThreads || 0} threads`);
        
        setMerchants(merchants.map(m => 
          m.id === merchantId 
            ? { ...m, last_email_check: new Date().toISOString() }
            : m
        ));
      }
    } catch (err) {
      setError(`Failed to fetch emails for ${companyName}: ${err.response?.data?.message || err.message}`);
      console.error(err);
    } finally {
      setFetchingEmails(null);
    }
  };

  const handleTestEmail = async (e, merchantId, companyName, adminEmail) => {
    e.stopPropagation(); // Prevent row click
    try {
      setTestingEmail(merchantId);
      setError('');
      setSuccess('');
      
      const response = await emailAPI.testReminder(merchantId);
      
      if (response.success) {
        setSuccess(`🎉 Test email sent to ${adminEmail}! Check your inbox.`);
      }
    } catch (err) {
      setError(`Failed to send test email: ${err.response?.data?.message || err.message}`);
      console.error(err);
    } finally {
      setTestingEmail(null);
    }
  };

  const handleEdit = (e, merchantId) => {
    e.stopPropagation(); // Prevent row click
    navigate(`/edit-merchant/${merchantId}`);
  };

  const handleDeleteClick = (e, merchantId) => {
    e.stopPropagation(); // Prevent row click
    setDeleteConfirm(merchantId);
  };

  const handleDelete = async (id) => {
    try {
      const response = await merchantAPI.delete(id);
      if (response.success) {
        setMerchants(merchants.filter(m => m.id !== id));
        setDeleteConfirm(null);
        setSuccess('Merchant deleted successfully');
      }
    } catch (err) {
      setError('Failed to delete merchant');
      console.error(err);
    }
  };

  const handleRowClick = (merchantId) => {
    navigate(`/emails/${merchantId}`);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading merchants...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Merchants</h1>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/add-merchant')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
            >
              + Add Merchant
            </button>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← Back to Dashboard
            </button>
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

        {/* Tip */}
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded text-sm">
          💡 <strong>Tip:</strong> Click anywhere on a merchant row to view their email threads
        </div>

        {merchants.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <div className="text-6xl mb-4">📭</div>
            <p className="text-gray-600 mb-4">No merchants added yet</p>
            <button
              onClick={() => navigate('/add-merchant')}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
            >
              Add Your First Merchant
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gmail
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gateways
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Check
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {merchants.map((merchant) => (
                  <tr 
                    key={merchant.id}
                    onClick={() => handleRowClick(merchant.id)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-blue-600 hover:text-blue-800">
                        {merchant.company_name} →
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-500">Admin:</span>
                        <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                          {merchant.admin_reminder_email}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {merchant.gmail_username}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {merchant.selected_gateways?.map((gateway) => (
                          <span
                            key={gateway}
                            className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800"
                          >
                            {gateway}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div>{formatDate(merchant.last_email_check)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          merchant.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {merchant.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={(e) => handleFetchEmails(e, merchant.id, merchant.company_name)}
                          disabled={fetchingEmails === merchant.id}
                          className="px-3 py-1 bg-purple-100 text-purple-700 hover:bg-purple-200 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          {fetchingEmails === merchant.id ? '⏳...' : '📧 Fetch'}
                        </button>
                        <button
                          onClick={(e) => handleTestEmail(e, merchant.id, merchant.company_name, merchant.admin_reminder_email)}
                          disabled={testingEmail === merchant.id}
                          className="px-3 py-1 bg-orange-100 text-orange-700 hover:bg-orange-200 rounded-md text-xs font-medium disabled:opacity-50 transition-colors"
                        >
                          {testingEmail === merchant.id ? '⏳...' : '🧪 Test'}
                        </button>
                        <button
                          onClick={(e) => handleEdit(e, merchant.id)}
                          className="px-3 py-1 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-md text-xs font-medium transition-colors"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(e, merchant.id)}
                          className="px-3 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded-md text-xs font-medium transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                ⚠️ Confirm Delete
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this merchant? This will also delete all associated emails and threads. This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium"
                >
                  Yes, Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Merchants;