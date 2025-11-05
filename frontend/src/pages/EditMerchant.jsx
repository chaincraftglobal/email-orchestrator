import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { merchantAPI } from '../services/api';

function EditMerchant() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingGmail, setTestingGmail] = useState(false);
  const [gmailTested, setGmailTested] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [formData, setFormData] = useState({
    company_name: '',
    gmail_username: '',
    gmail_app_password: '',
    selected_gateways: [],
    admin_reminder_email: '',
    self_reminder_time: 30,
    vendor_followup_time: 180,
    email_check_frequency: 30,
    is_active: true
  });

  const gateways = [
    { id: 'razorpay', name: 'Razorpay' },
    { id: 'payu', name: 'PayU' },
    { id: 'cashfree', name: 'Cashfree' },
    { id: 'paytm', name: 'Paytm' },
    { id: 'virtualpay', name: 'Virtual Pay' }
  ];

  useEffect(() => {
    fetchMerchant();
  }, [id]);

  const fetchMerchant = async () => {
    try {
      setLoading(true);
      const response = await merchantAPI.getById(id);
      if (response.success) {
        setFormData({
          ...response.merchant,
          gmail_app_password: ''
        });
      }
    } catch (err) {
      setError('Failed to load merchant');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'checkbox' ? checked : value 
    });
    setError('');
    setSuccess('');
    if (name === 'gmail_username' || name === 'gmail_app_password') {
      if (name === 'gmail_app_password' && value !== '') {
        setGmailTested(false);
      }
    }
  };

  const handleGatewayChange = (gatewayId) => {
    const selected = formData.selected_gateways.includes(gatewayId)
      ? formData.selected_gateways.filter(id => id !== gatewayId)
      : [...formData.selected_gateways, gatewayId];
    setFormData({ ...formData, selected_gateways: selected });
  };

  const handleTestGmail = async () => {
    if (!formData.gmail_username || !formData.gmail_app_password) {
      setError('Please enter Gmail username and app password first');
      return;
    }

    setTestingGmail(true);
    setError('');
    setSuccess('');

    try {
      const response = await merchantAPI.testGmail(
        formData.gmail_username,
        formData.gmail_app_password
      );
      
      if (response.success) {
        setSuccess('✅ Gmail connection successful!');
        setGmailTested(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Gmail connection failed');
      setGmailTested(false);
    } finally {
      setTestingGmail(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!formData.company_name || !formData.gmail_username || !formData.admin_reminder_email) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.selected_gateways.length === 0) {
      setError('Please select at least one payment gateway');
      return;
    }

    if (formData.gmail_app_password && !gmailTested) {
      setError('Please test Gmail connection before saving');
      return;
    }

    setSaving(true);

    try {
      const updateData = { ...formData };
      if (!updateData.gmail_app_password) {
        delete updateData.gmail_app_password;
      }

      const response = await merchantAPI.update(id, updateData);
      
      if (response.success) {
        setSuccess('Merchant updated successfully! Redirecting...');
        setTimeout(() => {
          navigate('/merchants');
        }, 1500);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update merchant');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading merchant...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Edit Merchant</h1>
          <button
            onClick={() => navigate('/merchants')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Merchants
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow p-6">
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

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-900 mb-3">Gmail Credentials</h3>
              
              <div className="mb-3">
                <label className="block text-gray-700 font-bold mb-2">
                  Gmail Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  name="gmail_username"
                  value={formData.gmail_username}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="mb-3">
                <label className="block text-gray-700 font-bold mb-2">
                  Gmail App Password (leave empty to keep current)
                </label>
                <input
                  type="password"
                  name="gmail_app_password"
                  value={formData.gmail_app_password}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter new password or leave empty"
                />
              </div>

              {formData.gmail_app_password && (
                <button
                  type="button"
                  onClick={handleTestGmail}
                  disabled={testingGmail}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {testingGmail ? 'Testing...' : gmailTested ? '✅ Tested' : 'Test Connection'}
                </button>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">
                Select Payment Gateways <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                {gateways.map(gateway => (
                  <label key={gateway.id} className="flex items-center space-x-2 p-2 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.selected_gateways.includes(gateway.id)}
                      onChange={() => handleGatewayChange(gateway.id)}
                      className="w-4 h-4"
                    />
                    <span>{gateway.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-bold mb-2">
                Admin Reminder Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="admin_reminder_email"
                value={formData.admin_reminder_email}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-bold text-gray-900 mb-3">Reminder Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-gray-700 font-bold mb-2">
                    Self Reminder Time
                  </label>
                  <select
                    name="self_reminder_time"
                    value={formData.self_reminder_time}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                    <option value={300}>5 hours</option>
                    <option value={360}>6 hours</option>
                    <option value={720}>12 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-2">
                    Vendor Followup Time
                  </label>
                  <select
                    name="vendor_followup_time"
                    value={formData.vendor_followup_time}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={180}>3 hours</option>
                    <option value={360}>6 hours</option>
                    <option value={720}>12 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-700 font-bold mb-2">
                    Email Check Frequency
                  </label>
                  <select
                    name="email_check_frequency"
                    value={formData.email_check_frequency}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={180}>3 hours</option>
                    <option value={300}>5 hours</option>
                    <option value={360}>6 hours</option>
                    <option value={480}>8 hours</option>
                    <option value={600}>10 hours</option>
                    <option value={720}>12 hours</option>
                    <option value={1440}>24 hours</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleChange}
                  className="w-4 h-4"
                />
                <span className="text-gray-700 font-bold">Active</span>
              </label>
              <p className="text-sm text-gray-500 mt-1">
                Uncheck to temporarily disable email checking for this merchant
              </p>
            </div>

            <div className="flex gap-4">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Updating...' : 'Update Merchant'}
              </button>
              
              <button
                type="button"
                onClick={() => navigate('/merchants')}
                className="px-6 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default EditMerchant;