import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout, ProtectedRoute } from '../layouts/MainLayout';
import { Login } from '../pages/Login';
import { Register } from '../pages/Register';
import { Dashboard } from '../pages/Dashboard';
import { InterviewWorkspace } from '../pages/InterviewWorkspace';
import { useAuth } from '../context/AuthContext';

export const AppRoutes = () => {
  const { user, loading } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
      {/* Protected Routes inside MainLayout */}
      <Route element={<MainLayout />}>
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        {/* Redirect root to dashboard if logged in, else login */}
        <Route 
          path="/" 
          element={
            loading ? null : user ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />
          } 
        />
      </Route>

      {/* Standalone protected route for workspace (no MainLayout wrapper) */}
      <Route 
        path="/interviews/:id" 
        element={
          <ProtectedRoute>
            <InterviewWorkspace />
          </ProtectedRoute>
        } 
      />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
