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

  const handleFetchEmails = async (merchantId, companyName) => {
    try {
      setFetchingEmails(merchantId);
      setError('');
      setSuccess('');
      
      const response = await emailAPI.fetchEmails(merchantId);
      
      if (response.success) {
        setSuccess(`✅ ${companyName}: ${response.message}`);
        
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

  const handleTestEmail = async (merchantId, companyName, adminEmail) => {
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

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
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
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg"
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

        {merchants.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
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
                  <tr key={merchant.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {merchant.company_name}
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
                        {merchant.selected_gateways.map((gateway) => (
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
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFetchEmails(merchant.id, merchant.company_name)}
                            disabled={fetchingEmails === merchant.id}
                            className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                          >
                            {fetchingEmails === merchant.id ? '⏳ Fetching...' : '📧 Fetch Emails'}
                          </button>
                          <button
                            onClick={() => handleTestEmail(merchant.id, merchant.company_name, merchant.admin_reminder_email)}
                            disabled={testingEmail === merchant.id}
                            className="text-orange-600 hover:text-orange-900 disabled:opacity-50"
                          >
                            {testingEmail === merchant.id ? '⏳ Sending...' : '🧪 Test Email'}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => navigate(`/emails/${merchant.id}`)}
                            className="text-green-600 hover:text-green-900"
                          >
                            👁️ View
                          </button>
                          <button
                            onClick={() => navigate(`/edit-merchant/${merchant.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(merchant.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
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
                Confirm Delete
              </h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete this merchant? This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg"
                >
                  Delete
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-lg"
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
