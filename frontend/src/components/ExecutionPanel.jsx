import React from 'react';

export const ExecutionPanel = () => {
  return (
    <div className="execution-panel">
      <div className="execution-toolbar">
        <button className="btn btn-primary" disabled style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
          Run Code (Coming soon)
        </button>
        <button className="btn btn-danger" disabled style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}>
          Submit (Coming soon)
        </button>
      </div>
      
      <div className="execution-output">
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
          Code execution and outputs will appear here in future phases.
        </p>
      </div>
    </div>
  );
};
