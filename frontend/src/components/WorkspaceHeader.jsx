import React from 'react';
import { useNavigate } from 'react-router-dom';

export const WorkspaceHeader = ({ interview, userRole }) => {
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
