import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const MainLayout = () => {
  const { user, loading, logout } = useAuth();
  
  // Wait until we know if they are authenticated
  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {user && (
        <header className="app-header">
          <h2>Sandbox</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)' }}>{user.email}</span>
            <button className="btn btn-danger" onClick={logout} style={{ padding: '0.4rem 1rem' }}>
              Logout
            </button>
          </div>
        </header>
      )}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
};

// Protected route wrapper
export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // Let MainLayout handle the loading spinner

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};
