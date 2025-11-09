import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { merchantAPI } from '../services/api';

function AddMerchant() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    company_name: '',
    gmail_username: '',
    gmail_app_password: '',
    admin_reminder_email: '',
    self_reminder_time: 30,
    vendor_reminder_time: 1440,
    email_check_frequency: 5,
    selected_gateways: []
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  const gateways = [
    { id: 'razorpay', name: 'Razorpay' },
    { id: 'payu', name: 'PayU' },
    { id: 'cashfree', name: 'Cashfree' },
    { id: 'paytm', name: 'Paytm' },
    { id: 'virtualpay', name: 'VirtualPay' }
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleGatewayToggle = (gatewayId) => {
    setFormData(prev => ({
      ...prev,
      selected_gateways: prev.selected_gateways.includes(gatewayId)
        ? prev.selected_gateways.filter(g => g !== gatewayId)
        : [...prev.selected_gateways, gatewayId]
    }));
  };

  const handleTestGmail = async () => {
    if (!formData.gmail_username || !formData.gmail_app_password) {
      setTestResult({ success: false, message: 'Please enter Gmail credentials first' });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const response = await merchantAPI.testGmail(
        formData.gmail_username,
        formData.gmail_app_password
      );
      setTestResult(response);
    } catch (err) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Connection failed'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (formData.selected_gateways.length === 0) {
      setError('Please select at least one payment gateway');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await merchantAPI.create(formData);
      
      if (response.success) {
        navigate('/merchants');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add merchant');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Add New Merchant</h1>
          <button
            onClick={() => navigate('/merchants')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Merchants
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Setup Guide Toggle */}
        <div className="mb-6 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-2xl">📚</span>
              <h3 className="text-lg font-bold text-blue-900">First Time Setup?</h3>
            </div>
            <button
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              {showSetupGuide ? '✕ Hide Guide' : '📖 Show Setup Guide'}
            </button>
          </div>
          
          {showSetupGuide && (
            <div className="mt-4 space-y-4 text-sm text-gray-700">
              
              {/* Step 1: Gmail Setup */}
              <div className="bg-white p-4 rounded-lg border border-blue-200">
                <h4 className="font-bold text-blue-900 mb-2 flex items-center gap-2">
                  <span className="bg-blue-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  Gmail App Password Setup
                </h4>
                <ol className="list-decimal list-inside space-y-1 ml-6">
                  <li>Go to: <a href="https://myaccount.google.com/security" target="_blank" rel="noopener" className="text-blue-600 underline">Google Account Security</a></li>
                  <li>Enable <strong>2-Step Verification</strong> (if not already enabled)</li>
                  <li>Search for "App passwords" in the search bar</li>
                  <li>Click <strong>"App passwords"</strong></li>
                  <li>Select <strong>"Mail"</strong> and <strong>"Other (Custom name)"</strong></li>
                  <li>Enter name: "Email Orchestrator"</li>
                  <li>Click <strong>"Generate"</strong></li>
                  <li>Copy the 16-character password (remove spaces)</li>
                  <li>Paste it in the "Gmail App Password" field below</li>
                </ol>
              </div>

              {/* Step 2: SendGrid Setup */}
              <div className="bg-white p-4 rounded-lg border border-orange-200">
                <h4 className="font-bold text-orange-900 mb-2 flex items-center gap-2">
                  <span className="bg-orange-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                  SendGrid Email Sender Setup (IMPORTANT!)
                </h4>
                <div className="space-y-2">
                  <p className="font-semibold text-orange-800">⚠️ You MUST verify the Gmail address in SendGrid to send reminders!</p>
                  <ol className="list-decimal list-inside space-y-1 ml-6">
                    <li>Go to: <a href="https://app.sendgrid.com/settings/sender_auth/senders" target="_blank" rel="noopener" className="text-blue-600 underline">SendGrid Sender Authentication</a></li>
                    <li>Click <strong>"Create New Sender"</strong></li>
                    <li>Fill the form:
                      <ul className="list-disc list-inside ml-6 mt-1">
                        <li><strong>From Email</strong>: Use the SAME Gmail address (e.g., dipak.printkartindia@gmail.com)</li>
                        <li><strong>From Name</strong>: Email Orchestrator</li>
                        <li><strong>Reply To</strong>: Same Gmail address</li>
                        <li>Fill other fields (address, city, etc.)</li>
                      </ul>
                    </li>
                    <li>Click <strong>"Create"</strong></li>
                    <li>Check your Gmail inbox for verification email from SendGrid</li>
                    <li>Click the <strong>verification link</strong> in the email</li>
                    <li>You should see: <strong>"Email Address Verified Successfully!"</strong> ✅</li>
                  </ol>
                  <div className="bg-red-50 border border-red-200 p-3 rounded mt-2">
                    <p className="text-red-800 text-xs font-semibold">
                      ❌ Without verification, reminder emails will FAIL with "403 Forbidden" error!
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 3: Admin Email */}
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <h4 className="font-bold text-green-900 mb-2 flex items-center gap-2">
                  <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">3</span>
                  Admin Reminder Email
                </h4>
                <p>This is the email address where YOU will receive reminders when vendor emails need replies.</p>
                <p className="mt-2 text-xs text-gray-600">💡 Tip: Can be same as Gmail or different (e.g., your personal email)</p>
              </div>

              {/* Quick Checklist */}
              <div className="bg-purple-50 border border-purple-300 p-4 rounded-lg">
                <h4 className="font-bold text-purple-900 mb-2">✅ Quick Checklist Before Submitting:</h4>
                <ul className="space-y-1 text-sm">
                  <li>✓ Gmail App Password generated and tested</li>
                  <li>✓ Gmail address verified in SendGrid (green checkmark ✅)</li>
                  <li>✓ Admin reminder email entered</li>
                  <li>✓ At least one payment gateway selected</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., PrintKart India"
              />
            </div>

            {/* Gmail Credentials */}
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span>📧</span> Gmail Configuration
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gmail Address *
                  </label>
                  <input
                    type="email"
                    name="gmail_username"
                    value={formData.gmail_username}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="dipak.printkartindia@gmail.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    💡 This Gmail will be used to fetch onboarding emails
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gmail App Password *
                  </label>
                  <input
                    type="password"
                    name="gmail_app_password"
                    value={formData.gmail_app_password}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="xxxx xxxx xxxx xxxx"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    ⚠️ Not your Gmail password! Generate app password from Google Account settings
                  </p>
                </div>

                {/* Test Gmail Button */}
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleTestGmail}
                    disabled={testing}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {testing ? '⏳ Testing...' : '🧪 Test Gmail Connection'}
                  </button>
                  
                  {testResult && (
                    <div className={`flex items-center gap-2 ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                      <span>{testResult.success ? '✅' : '❌'}</span>
                      <span className="text-sm font-medium">{testResult.message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Admin Reminder Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Admin Reminder Email *
              </label>
              <input
                type="email"
                name="admin_reminder_email"
                value={formData.admin_reminder_email}
                onChange={handleChange}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="dipak.lacewingtech@gmail.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                📬 You'll receive reminder emails at this address when vendors need replies
              </p>
            </div>

            {/* Payment Gateways */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Payment Gateways to Monitor *
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {gateways.map(gateway => (
                  <button
                    key={gateway.id}
                    type="button"
                    onClick={() => handleGatewayToggle(gateway.id)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      formData.selected_gateways.includes(gateway.id)
                        ? 'border-blue-500 bg-blue-50 text-blue-900'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">
                        {formData.selected_gateways.includes(gateway.id) ? '✅' : '⬜'}
                      </div>
                      <div className="font-medium">{gateway.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Reminder Settings */}
          {/* Reminder Settings */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Self Reminder (minutes)
    </label>
    <select
      name="self_reminder_time"
      value={formData.self_reminder_time}
      onChange={handleChange}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      <option value="5">5 minutes</option>
      <option value="10">10 minutes</option>
      <option value="15">15 minutes</option>
      <option value="30">30 minutes</option>
      <option value="45">45 minutes</option>
      <option value="60">1 hour</option>
      <option value="90">1.5 hours</option>
      <option value="120">2 hours</option>
      <option value="180">3 hours</option>
      <option value="240">4 hours</option>
      <option value="300">5 hours</option>
      <option value="360">6 hours</option>
      <option value="480">8 hours</option>
      <option value="540">9 hours</option>
      <option value="720">12 hours</option>
      <option value="900">15 hours</option>
      <option value="1440">24 hours</option>
    </select>
    <p className="text-xs text-gray-500 mt-1">Time before you get reminded to reply</p>
  </div>

  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Vendor Reminder (minutes)
    </label>
    <select
      name="vendor_reminder_time"
      value={formData.vendor_reminder_time}
      onChange={handleChange}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      <option value="30">30 minutes</option>
      <option value="60">1 hour</option>
      <option value="120">2 hours</option>
      <option value="180">3 hours</option>
      <option value="240">4 hours</option>
      <option value="360">6 hours</option>
      <option value="480">8 hours</option>
      <option value="540">9 hours</option>
      <option value="720">12 hours</option>
      <option value="900">15 hours</option>
      <option value="1080">18 hours</option>
      <option value="1440">24 hours (1 day)</option>
      <option value="2160">36 hours (1.5 days)</option>
      <option value="2880">48 hours (2 days)</option>
      <option value="4320">72 hours (3 days)</option>
    </select>
    <p className="text-xs text-gray-500 mt-1">Time before nudging vendor</p>
  </div>

  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Check Frequency (minutes)
    </label>
    <select
      name="email_check_frequency"
      value={formData.email_check_frequency}
      onChange={handleChange}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    >
      <option value="1">1 minute</option>
      <option value="2">2 minutes</option>
      <option value="5">5 minutes</option>
      <option value="10">10 minutes</option>
      <option value="15">15 minutes</option>
      <option value="30">30 minutes</option>
      <option value="60">1 hour</option>
      <option value="120">2 hours</option>
      <option value="180">3 hours</option>
      <option value="360">6 hours</option>
      <option value="720">12 hours</option>
    </select>
    <p className="text-xs text-gray-500 mt-1">How often to check emails</p>
  </div>
</div>

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '⏳ Adding Merchant...' : '✅ Add Merchant'}
              </button>
              
              <button
                type="button"
                onClick={() => navigate('/merchants')}
                className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50"
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

export default AddMerchant;
