import React from 'react';

export const ProblemPanel = ({ problems, activeProblemId, onProblemChange }) => {
  if (!problems || problems.length === 0) {
    return (
      <div className="problem-panel">
        <div style={{ padding: '1.5rem', color: 'var(--text-muted)' }}>
          No problems assigned to this interview.
        </div>
      </div>
    );
  }

  const activeProblem = problems.find(p => p.id === activeProblemId) || problems[0];

  return (
    <div className="problem-panel">
      {problems.length > 1 && (
        <div className="problem-tabs">
          {problems.map(p => (
            <button
              key={p.id}
              className={`problem-tab ${activeProblemId === p.id ? 'active' : ''}`}
              onClick={() => onProblemChange(p.id)}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
      
      <div className="problem-content">
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{activeProblem.title}</h2>
        <span className={`difficulty-badge difficulty-${activeProblem.difficulty.toLowerCase()}`}>
          {activeProblem.difficulty}
        </span>
        
        <div className="problem-description" style={{ marginTop: '1.5rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
          {activeProblem.description}
        </div>
      </div>
    </div>
  );
};
