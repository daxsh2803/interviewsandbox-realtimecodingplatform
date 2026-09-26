import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { getSocket } from '../api/socketClient';

export const ExecutionPanel = ({ yDoc, language, interviewId, problemId }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleExecutionUpdated = (payload) => {
        // If it's for the problem we're currently looking at, update the result
        // We might want to track executionIds specifically, but for now we'll just update
        setExecutionResult(payload);
        if (payload.status !== 'Processing') {
          setIsRunning(false);
        }
      };
      
      socket.on('execution:updated', handleExecutionUpdated);
      return () => {
        socket.off('execution:updated', handleExecutionUpdated);
      };
    }
  }, []);

  const handleRunCode = async () => {
    if (!yDoc || !interviewId || !problemId) return;

    setError(null);
    setIsRunning(true);
    setExecutionResult({ status: 'Submitting...' });

    try {
      const sourceCode = yDoc.getText('monaco').toString();
      
      const response = await apiClient(`/interviews/${interviewId}/execute`, {
        method: 'POST',
        body: {
          problemId,
          language,
          sourceCode,
          stdin: '' // Future enhancement: capture stdin
        }
      });
      
      setExecutionResult({
        executionId: response.executionId,
        status: response.status
      });

    } catch (err) {
      setError(err.message);
      setIsRunning(false);
      setExecutionResult(null);
    }
  };

  return (
    <div className="execution-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)' }}>
      <div className="execution-toolbar" style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem' }}>
        <button 
          className="btn btn-primary" 
          onClick={handleRunCode}
          disabled={isRunning || !yDoc || !problemId}
          style={{ padding: '0.4rem 1rem', fontSize: '0.875rem' }}
        >
          {isRunning ? 'Running...' : 'Run Code'}
        </button>
      </div>
      
      <div className="execution-output" style={{ padding: '1rem', overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: '0.9rem' }}>
        {error && <div style={{ color: 'var(--error-color)' }}>Error: {error}</div>}
        
        {!executionResult && !error && (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Run code to see outputs here.
          </p>
        )}

        {executionResult && (
          <div>
            <div style={{ marginBottom: '0.5rem', fontWeight: 'bold', color: 
              executionResult.status === 'Accepted' ? 'var(--success-color)' : 
              (executionResult.status === 'Processing' || executionResult.status === 'Submitting...') ? 'var(--text-muted)' : 
              'var(--error-color)' 
            }}>
              Status: {executionResult.status}
            </div>
            
            {executionResult.executionTimeMs != null && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
                Time: {executionResult.executionTimeMs} ms | Memory: {executionResult.memoryBytes ? Math.round(executionResult.memoryBytes / 1024) + ' KB' : 'N/A'}
              </div>
            )}

            {executionResult.stdout && (
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ color: 'var(--text-muted)' }}>stdout:</strong>
                <pre style={{ backgroundColor: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                  {executionResult.stdout}
                </pre>
              </div>
            )}
            
            {executionResult.stderr && (
              <div>
                <strong style={{ color: 'var(--error-color)' }}>stderr / compilation error:</strong>
                <pre style={{ backgroundColor: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '4px', marginTop: '0.25rem', whiteSpace: 'pre-wrap', color: 'var(--error-color)' }}>
                  {executionResult.stderr}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
