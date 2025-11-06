import React from 'react';
import { useNavigate } from 'react-router-dom';
import authService from '../services/authService';

const LogoutButton = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    authService.logout();
    navigate('/');
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition duration-200"
    >
      Logout
    </button>
  );
};

export default LogoutButton;
