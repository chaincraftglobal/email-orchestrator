import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Merchants from './pages/Merchants';
import AddMerchant from './pages/AddMerchant';
import EditMerchant from './pages/EditMerchant';
import EmailList from './pages/EmailList';
import ThreadView from './pages/ThreadView';
import Scheduler from './pages/Scheduler';

function App() {
  return (
    <Router>
      <Routes>
        {/* Login Page - Default Route */}
        <Route path="/" element={<Login />} />
        
        {/* Dashboard - After Login */}
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* Merchants List */}
        <Route path="/merchants" element={<Merchants />} />
        
        {/* Add Merchant */}
        <Route path="/add-merchant" element={<AddMerchant />} />
        
        {/* Edit Merchant */}
        <Route path="/edit-merchant/:id" element={<EditMerchant />} />
        
        {/* Email List for Merchant */}
        <Route path="/emails/:merchantId" element={<EmailList />} />
        
        {/* Thread View - Chat Style */}
        <Route path="/thread/:threadId" element={<ThreadView />} />
        
        {/* Scheduler Dashboard */}
        <Route path="/scheduler" element={<Scheduler />} />
      </Routes>
    </Router>
  );
}

export default App;