import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // Initial load to check session

  // Check session on startup
  useEffect(() => {
    const checkSession = async () => {
      try {
        const data = await apiClient('/auth/me');
        setUser(data.user);
      } catch (error) {
        setUser(null); // Unauthenticated or expired
      } finally {
        setLoading(false);
      }
    };
    
    checkSession();
  }, []);

  const login = async (email, password) => {
    const data = await apiClient('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await apiClient('/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    // The backend register endpoint in Phase 3 does NOT auto-login 
    // and doesn't set the cookie. We just return it.
    return data;
  };

  const logout = async () => {
    try {
      await apiClient('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
