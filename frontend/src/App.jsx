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
import PrivateRoute from './components/PrivateRoute';

function App() {
  return (
    <Router>
      <Routes>
        {/* Login Page - Public Route */}
        <Route path="/" element={<Login />} />
        
        {/* Protected Routes - Require Authentication */}
        <Route path="/dashboard" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />
        
        <Route path="/merchants" element={
          <PrivateRoute>
            <Merchants />
          </PrivateRoute>
        } />
        
        <Route path="/add-merchant" element={
          <PrivateRoute>
            <AddMerchant />
          </PrivateRoute>
        } />
        
        <Route path="/edit-merchant/:id" element={
          <PrivateRoute>
            <EditMerchant />
          </PrivateRoute>
        } />
        
        <Route path="/emails/:merchantId" element={
          <PrivateRoute>
            <EmailList />
          </PrivateRoute>
        } />
        
        <Route path="/thread/:threadId" element={
          <PrivateRoute>
            <ThreadView />
          </PrivateRoute>
        } />
        
        <Route path="/scheduler" element={
          <PrivateRoute>
            <Scheduler />
          </PrivateRoute>
        } />
      </Routes>
    </Router>
  );
}

export default App;