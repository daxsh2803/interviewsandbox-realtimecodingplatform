import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { interviewApi } from '../api/interviewApi';
import { useNavigate } from 'react-router-dom';

export const Dashboard = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchInterviews = async () => {
      try {
        const data = await interviewApi.getInterviews();
        setInterviews(data.interviews || []);
      } catch (err) {
        setError(err.message || 'Failed to load interviews');
      } finally {
        setLoading(false);
      }
    };
    fetchInterviews();
  }, []);

  return (
    <div className="container page-enter">
      <div style={{ padding: '2rem 0' }}>
        <h1 style={{ marginBottom: '2rem' }}>Dashboard</h1>
        
        <div className="glass-card" style={{ maxWidth: '100%', marginBottom: '2rem' }}>
          <h2>Welcome, {user.name || user.email}!</h2>
          <p>You have successfully authenticated into the Sandbox platform.</p>
          
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>Account Details</h3>
            <ul style={{ listStyle: 'none' }}>
              <li><strong>Email:</strong> <span style={{ color: 'var(--text-muted)' }}>{user.email}</span></li>
              <li><strong>Name:</strong> <span style={{ color: 'var(--text-muted)' }}>{user.name || 'N/A'}</span></li>
            </ul>
          </div>
        </div>

        <h2 style={{ marginBottom: '1rem' }}>My Interviews</h2>
        {error && <div className="alert alert-error">{error}</div>}
        
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
            <span>Loading interviews...</span>
          </div>
        ) : interviews.length === 0 ? (
          <div className="glass-card" style={{ maxWidth: '100%', textAlign: 'center', padding: '3rem' }}>
            <p style={{ margin: 0 }}>You don't have any interviews scheduled yet.</p>
          </div>
        ) : (
          <div className="interview-grid">
            {interviews.map(interview => (
              <div key={interview.id} className="glass-card" style={{ maxWidth: '100%' }}>
                <h3 style={{ marginBottom: '0.5rem' }}>{interview.title}</h3>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  <p style={{ margin: '0 0 0.5rem 0' }}><strong>Status:</strong> {interview.status}</p>
                  <p style={{ margin: '0 0 0.5rem 0' }}><strong>Role:</strong> {interview.role}</p>
                  <p style={{ margin: 0 }}><strong>ID:</strong> {interview.id}</p>
                </div>
                <button 
                  className="btn btn-primary" 
                  onClick={() => navigate(`/interviews/${interview.id}`)}
                >
                  Enter Workspace
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
