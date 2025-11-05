import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { schedulerAPI } from '../services/api';

function Scheduler() {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchStatus();
    // Auto-refresh status every 10 seconds
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const response = await schedulerAPI.getStatus();
      if (response.success) {
        setStatus(response.status);
      }
    } catch (err) {
      setError('Failed to load scheduler status');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async () => {
    try {
      setActionLoading(true);
      setError('');
      setSuccess('');
      
      const response = await schedulerAPI.start();
      
      if (response.success) {
        setSuccess('✅ Scheduler started successfully!');
        setStatus(response.status);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start scheduler');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      setActionLoading(true);
      setError('');
      setSuccess('');
      
      const response = await schedulerAPI.stop();
      
      if (response.success) {
        setSuccess('✅ Scheduler stopped successfully!');
        setStatus(response.status);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to stop scheduler');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRestart = async () => {
    try {
      setActionLoading(true);
      setError('');
      setSuccess('');
      
      const response = await schedulerAPI.restart();
      
      if (response.success) {
        setSuccess('✅ Scheduler restarted successfully!');
        setStatus(response.status);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to restart scheduler');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatFrequency = (minutes) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    return `${hours} hr${hours > 1 ? 's' : ''}`;
  };

  if (loading && !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading scheduler status...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Email Scheduler</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-600 hover:text-gray-900"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Messages */}
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

        {/* Status Card */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Scheduler Status
              </h2>
              <div className="flex items-center gap-3">
                <span
                  className={`px-4 py-2 text-sm font-semibold rounded-full ${
                    status?.isRunning
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {status?.isRunning ? '🟢 Running' : '🔴 Stopped'}
                </span>
                <span className="text-gray-600">
                  Active Jobs: <strong>{status?.totalJobs || 0}</strong>
                </span>
              </div>
            </div>

            {/* Control Buttons */}
            <div className="flex gap-3">
              {!status?.isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={actionLoading}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                >
                  {actionLoading ? 'Starting...' : '▶️ Start Scheduler'}
                </button>
              ) : (
                <>
                  <button
                    onClick={handleRestart}
                    disabled={actionLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                  >
                    {actionLoading ? 'Restarting...' : '🔄 Restart'}
                  </button>
                  <button
                    onClick={handleStop}
                    disabled={actionLoading}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                  >
                    {actionLoading ? 'Stopping...' : '⏹️ Stop'}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="text-sm text-gray-500">
            ℹ️ The scheduler automatically checks emails for all active merchants based on their configured frequency.
          </div>
        </div>

        {/* Active Jobs List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-bold text-gray-900">Active Jobs</h3>
          </div>

          {!status?.jobs || status.jobs.length === 0 ? (
            <div className="p-8 text-center text-gray-600">
              {status?.isRunning 
                ? 'No active jobs. Add some active merchants first.'
                : 'Scheduler is stopped. Start it to see active jobs.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Merchant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Check Frequency
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Last Run
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Next Run
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {status.jobs.map((job) => (
                    <tr key={job.merchantId}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {job.companyName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        Every {formatFrequency(job.frequency)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(job.lastRun)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(job.nextRun)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {job.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="font-bold text-blue-900 mb-2">ℹ️ How it works</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• The scheduler runs background jobs for each active merchant</li>
            <li>• Emails are checked based on the merchant's configured frequency</li>
            <li>• Gateway emails are automatically detected and stored</li>
            <li>• Thread status is updated (Waiting on Us / Waiting on Vendor)</li>
            <li>• Reminders will be sent when responses are overdue (coming soon)</li>
          </ul>
        </div>
      </main>
    </div>
  );
}

export default Scheduler;