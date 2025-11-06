// Authentication service
export const authService = {
  // Store token with timestamp
  setToken: (token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('tokenTimestamp', Date.now().toString());
  },

  // Get token
  getToken: () => {
    const token = localStorage.getItem('token');
    const timestamp = localStorage.getItem('tokenTimestamp');
    
    // Token valid for 24 hours (same as backend JWT)
    if (token && timestamp) {
      const hoursSinceLogin = (Date.now() - parseInt(timestamp)) / (1000 * 60 * 60);
      if (hoursSinceLogin < 24) {
        return token;
      } else {
        // Token expired, clear storage
        authService.logout();
        return null;
      }
    }
    return null;
  },

  // Check if user is logged in
  isAuthenticated: () => {
    return !!authService.getToken();
  },

  // Logout
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenTimestamp');
    localStorage.removeItem('user');
  },

  // Store user info
  setUser: (user) => {
    localStorage.setItem('user', JSON.stringify(user));
  },

  // Get user info
  getUser: () => {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }
};

export default authService;
