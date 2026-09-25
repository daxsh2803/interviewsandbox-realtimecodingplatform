import React from 'react';
import { useNavigate } from 'react-router-dom';

export const WorkspaceHeader = ({ interview, userRole, socketStatus, participants = [] }) => {
  const navigate = useNavigate();

  return (
    <header className="workspace-header">
      <div className="workspace-header-left">
        <button className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }} onClick={() => navigate('/dashboard')}>
          &larr; Dashboard
        </button>
        <h2 style={{ fontSize: '1.2rem', margin: 0, marginLeft: '1rem' }}>
          {interview?.title || 'Loading...'}
        </h2>
      </div>
      
      <div className="workspace-header-right">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginRight: '1rem', borderRight: '1px solid var(--border-color)', paddingRight: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%',
              backgroundColor: socketStatus === 'Connected' ? '#4ade80' : '#f87171'
            }}></span>
            {socketStatus}
          </div>
          {participants.length > 0 && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {participants.length} Active {participants.length === 1 ? 'User' : 'Users'}
            </div>
          )}
        </div>

        {interview && (
          <>
            <span className={`status-badge status-${interview.status.toLowerCase()}`}>
              {interview.status}
            </span>
            <span className="role-badge">
              Role: {userRole}
            </span>
          </>
        )}
      </div>
    </header>
  );
};
