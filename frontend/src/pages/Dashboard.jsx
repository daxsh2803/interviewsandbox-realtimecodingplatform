import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { interviewApi } from '../api/interviewApi';
import { useNavigate } from 'react-router-dom';

export const Dashboard = () => {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const navigate = useNavigate();

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

  useEffect(() => {
    fetchInterviews();
  }, []);

  const handleCreateInterview = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError('Interview title is required');
      return;
    }

    setCreating(true);
    setCreateError(null);

    try {
      const data = await interviewApi.createInterview({ title: newTitle.trim() });
      setShowCreateModal(false);
      setNewTitle('');
      if (data?.interview?.id) {
        navigate(`/interviews/${data.interview.id}`);
      } else {
        await fetchInterviews();
      }
    } catch (err) {
      setCreateError(err.message || 'Failed to create interview');
    } finally {
      setCreating(false);
    }
  };

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

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>My Interviews</h2>
          <button
            className="btn btn-primary"
            style={{ width: 'auto', padding: '0.6rem 1.25rem' }}
            onClick={() => { setShowCreateModal(true); setCreateError(null); }}
          >
            + Create Interview
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="spinner" style={{ width: '20px', height: '20px', borderWidth: '2px' }}></div>
            <span>Loading interviews...</span>
          </div>
        ) : interviews.length === 0 ? (
          <div className="glass-card" style={{ maxWidth: '100%', textAlign: 'center', padding: '3rem' }}>
            <p style={{ marginBottom: '1.5rem' }}>You don't have any interviews scheduled yet.</p>
            <button
              className="btn btn-primary"
              style={{ width: 'auto', margin: '0 auto' }}
              onClick={() => { setShowCreateModal(true); setCreateError(null); }}
            >
              + Create Your First Interview
            </button>
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
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    className="btn btn-primary"
                    onClick={() => navigate(`/interviews/${interview.id}`)}
                  >
                    Enter Workspace
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => navigate(`/interviews/${interview.id}/report`)}
                  >
                    View Report
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showCreateModal && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '1rem'
            }}
            onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
          >
            <div className="glass-card" style={{ width: '100%', maxWidth: '480px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.4rem' }}>Create New Interview</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    lineHeight: 1
                  }}
                >
                  &times;
                </button>
              </div>

              {createError && <div className="alert alert-error">{createError}</div>}

              <form onSubmit={handleCreateInterview}>
                <div className="form-group">
                  <label className="form-label" htmlFor="interview-title">Interview Title</label>
                  <input
                    id="interview-title"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Senior Frontend Technical Interview"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    disabled={creating}
                    autoFocus
                  />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setShowCreateModal(false)}
                    disabled={creating}
                    style={{
                      width: '50%',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: 'var(--text-main)'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating || !newTitle.trim()}
                    style={{ width: '50%' }}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
