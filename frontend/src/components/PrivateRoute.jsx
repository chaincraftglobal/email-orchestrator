import React, { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import authService from '../services/authService';

const PrivateRoute = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    // Check authentication on mount and periodically
    const checkAuth = () => {
      if (!authService.isAuthenticated()) {
        navigate('/');
      }
    };

    checkAuth();

    // Check every 5 minutes if token is still valid
    const interval = setInterval(checkAuth, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [navigate]);

  // If not authenticated, redirect to login
  if (!authService.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  // If authenticated, show the protected page
  return children;
};

export default PrivateRoute;
