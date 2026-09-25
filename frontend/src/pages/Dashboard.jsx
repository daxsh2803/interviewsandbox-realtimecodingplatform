import React from 'react';
import { useAuth } from '../context/AuthContext';

export const Dashboard = () => {
  const { user } = useAuth();

  return (
    <div className="container page-enter">
      <div style={{ padding: '2rem 0' }}>
        <h1>Dashboard</h1>
        
        <div className="glass-card" style={{ maxWidth: '100%', marginTop: '2rem' }}>
          <h2>Welcome, {user.name || user.email}!</h2>
          <p>You have successfully authenticated into the Sandbox platform.</p>
          
          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Account Details</h3>
            <ul style={{ listStyle: 'none' }}>
              <li style={{ marginBottom: '0.5rem' }}><strong>ID:</strong> <span style={{ color: 'var(--text-muted)' }}>{user.id}</span></li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Email:</strong> <span style={{ color: 'var(--text-muted)' }}>{user.email}</span></li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Name:</strong> <span style={{ color: 'var(--text-muted)' }}>{user.name || 'N/A'}</span></li>
            </ul>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <p style={{ color: 'var(--text-muted)' }}>
              Interview management and coding rooms will be available in upcoming phases.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
