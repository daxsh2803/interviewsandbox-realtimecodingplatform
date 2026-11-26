import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { getSocket } from '../api/socketClient';

export const ExecutionPanel = ({ yDoc, language, interviewId, problemId, disabled = false }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('run'); // 'run' or 'submit'
  const [activeConsoleTab, setActiveConsoleTab] = useState('output'); // 'output' or 'input'
  const [customStdin, setCustomStdin] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    if (socket) {
      const handleExecutionUpdated = (payload) => {
        setExecutionResult(prev => ({
          ...prev,
          ...payload
        }));
        if (payload.status !== 'Processing') {
          setIsRunning(false);
        }
      };

      const handleSubmissionUpdated = (payload) => {
        setSubmissionResult(payload);
        if (payload.status !== 'Processing') {
          setIsSubmitting(false);
        }
      };
      
      socket.on('execution:updated', handleExecutionUpdated);
      socket.on('submission:updated', handleSubmissionUpdated);
      return () => {
        socket.off('execution:updated', handleExecutionUpdated);
        socket.off('submission:updated', handleSubmissionUpdated);
      };
    }
  }, []);

  const handleRunCode = async () => {
    if (!yDoc || !interviewId || !problemId) return;

    setError(null);
    setIsRunning(true);
    setActiveTab('run');
    setActiveConsoleTab('output');
    setExecutionResult({
      status: 'Submitting...',
      stdin: customStdin.trim() ? customStdin : undefined,
      usedSampleTestCase: !customStdin.trim()
    });

    try {
      const sourceCode = yDoc.getText('sourceCode').toString();
      
      const response = await apiClient(`/interviews/${interviewId}/execute`, {
        method: 'POST',
        body: { problemId, language, sourceCode, stdin: customStdin }
      });
      
      setExecutionResult(prev => ({
        ...prev,
        executionId: response.executionId,
        status: response.status,
        stdin: response.stdin,
        expectedOutput: response.expectedOutput,
        usedSampleTestCase: response.usedSampleTestCase
      }));
    } catch (err) {
      setError(err.message);
      setIsRunning(false);
      setExecutionResult(null);
    }
  };

  const handleSubmitCode = async () => {
    if (!yDoc || !interviewId || !problemId) return;

    setError(null);
    setIsSubmitting(true);
    setActiveTab('submit');
    setActiveConsoleTab('output');
    setSubmissionResult({ status: 'Submitting...' });

    try {
      const sourceCode = yDoc.getText('sourceCode').toString();
      
      const response = await apiClient(`/interviews/${interviewId}/problems/${problemId}/submit`, {
        method: 'POST',
        body: { language, sourceCode }
      });
      
      setSubmissionResult({ submissionId: response.submissionId, status: response.status });
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
      setSubmissionResult(null);
    }
  };

  const hasAnyRunData = executionResult && (
    (executionResult.stdin != null && executionResult.stdin !== '') ||
    (executionResult.expectedOutput != null && executionResult.expectedOutput !== '') ||
    (executionResult.stdout != null && executionResult.stdout !== '')
  );

  return (
    <div 
      className="execution-panel" 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        borderTop: '1px solid var(--border-color)', 
        backgroundColor: 'var(--bg-secondary)',
        height: isExpanded ? '460px' : '260px',
        minHeight: '240px',
        maxHeight: isExpanded ? '75%' : '50%',
        transition: 'height 0.2s ease-in-out'
      }}
    >
      {/* Console Toolbar */}
      <div 
        className="execution-toolbar" 
        style={{ 
          padding: '0.4rem 0.75rem', 
          borderBottom: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem',
          flexWrap: 'nowrap',
          whiteSpace: 'nowrap',
          backgroundColor: 'var(--bg-surface)'
        }}
      >
        <button 
          className="btn btn-primary" 
          onClick={handleRunCode}
          disabled={disabled || isRunning || isSubmitting || !yDoc || !problemId}
          style={{ 
            padding: '0.35rem 0.85rem', 
            fontSize: '0.8rem',
            whiteSpace: 'nowrap',
            width: 'auto',
            flex: '0 0 auto'
          }}
        >
          {isRunning ? 'Running...' : 'Run Code'}
        </button>

        <button 
          className="btn btn-success" 
          onClick={handleSubmitCode}
          disabled={disabled || isRunning || isSubmitting || !yDoc || !problemId}
          style={{ 
            padding: '0.35rem 0.85rem', 
            fontSize: '0.8rem', 
            backgroundColor: 'var(--success-color, #22c55e)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: (disabled || isRunning || isSubmitting || !yDoc || !problemId) ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            width: 'auto',
            flex: '0 0 auto'
          }}
        >
          {isSubmitting ? 'Evaluating...' : 'Submit'}
        </button>

        {/* Separator */}
        <div style={{ width: '1px', height: '18px', backgroundColor: 'var(--border-color)', margin: '0 0.25rem', flexShrink: 0 }} />

        {/* Console View Tabs: Output | Custom Input */}
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setActiveConsoleTab('output')}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.8rem',
              borderRadius: '4px',
              border: '1px solid',
              borderColor: activeConsoleTab === 'output' ? 'var(--primary, #6366f1)' : 'transparent',
              backgroundColor: activeConsoleTab === 'output' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeConsoleTab === 'output' ? 'var(--primary, #818cf8)' : 'var(--text-muted)',
              fontWeight: activeConsoleTab === 'output' ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span>Output</span>
            {activeTab === 'submit' && submissionResult && (
              <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                ({submissionResult.status === 'Accepted' ? '✓' : 'Submit'})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveConsoleTab('input')}
            style={{
              padding: '0.3rem 0.65rem',
              fontSize: '0.8rem',
              borderRadius: '4px',
              border: '1px solid',
              borderColor: activeConsoleTab === 'input' ? 'var(--primary, #6366f1)' : 'transparent',
              backgroundColor: activeConsoleTab === 'input' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: activeConsoleTab === 'input' ? 'var(--primary, #818cf8)' : 'var(--text-muted)',
              fontWeight: activeConsoleTab === 'input' ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
            title="Configure custom stdin for execution"
          >
            <span>Custom Input</span>
            {customStdin.trim() && (
              <span 
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                  display: 'inline-block'
                }}
                title="Custom input has text"
              />
            )}
          </button>
        </div>

        {/* Expand / Collapse Button */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              color: 'var(--text-muted)',
              padding: '0.25rem 0.5rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              whiteSpace: 'nowrap'
            }}
            title={isExpanded ? "Collapse execution panel" : "Expand execution panel"}
          >
            <span>{isExpanded ? '▼' : '▲'}</span>
            <span>{isExpanded ? 'Collapse' : 'Expand'}</span>
          </button>
        </div>
      </div>

      {/* Custom Input Tab Content */}
      {activeConsoleTab === 'input' && (
        <div style={{ 
          padding: '0.75rem 1rem', 
          display: 'flex', 
          flexDirection: 'column', 
          flex: 1, 
          overflow: 'hidden',
          boxSizing: 'border-box' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Custom Standard Input (stdin):
            </span>
            {customStdin && (
              <button
                type="button"
                onClick={() => setCustomStdin('')}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: '0.15rem 0.5rem'
                }}
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={customStdin}
            onChange={(e) => setCustomStdin(e.target.value)}
            placeholder="Optional custom stdin — leave blank to run with sample test case"
            style={{
              flex: 1,
              width: '100%',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-tertiary, #1e2130)',
              color: 'var(--text-main, #e2e8f0)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              padding: '0.6rem 0.75rem',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              lineHeight: '1.4',
              resize: 'none'
            }}
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
            This input will be supplied to your code when you click <strong>Run Code</strong>.
          </div>
        </div>
      )}

      {/* Output Tab Content */}
      {activeConsoleTab === 'output' && (
        <div className="execution-output" style={{ padding: '0.75rem 1rem', overflowY: 'auto', flex: 1, fontFamily: 'monospace', fontSize: '0.9rem' }}>
          {error && <div style={{ color: 'var(--error-color)', marginBottom: '0.5rem' }}>Error: {error}</div>}
          
          {!executionResult && !submissionResult && !error && (
            <p style={{ color: 'var(--text-muted)', margin: 0 }}>
              Run or submit code to see outputs here.
            </p>
          )}

          {activeTab === 'run' && executionResult && (
            <div>
              {/* Compact Header Row: Status & Time/Memory */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '0.6rem', 
                paddingBottom: '0.4rem', 
                borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))' 
              }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '0.9rem', 
                  color: 
                    executionResult.status === 'Accepted' ? 'var(--success-color, #22c55e)' : 
                    (executionResult.status === 'Processing' || executionResult.status === 'Submitting...') ? 'var(--text-muted)' : 
                    'var(--error-color, #ef4444)' 
                }}>
                  Run Status: {executionResult.status}
                </div>
                
                {executionResult.executionTimeMs != null && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                    Time: {executionResult.executionTimeMs} ms | Memory: {executionResult.memoryBytes ? Math.round(executionResult.memoryBytes / 1024) + ' KB' : 'N/A'}
                  </div>
                )}
              </div>

              {/* Responsive Horizontal Grid for Input, Expected Output, and Actual Output */}
              {hasAnyRunData && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '0.6rem'
                }}>
                  {executionResult.stdin != null && executionResult.stdin !== '' && (
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <strong style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Input ({executionResult.usedSampleTestCase ? 'Sample Test Case' : 'Custom Input'}):
                      </strong>
                      <pre style={{ 
                        backgroundColor: 'var(--bg-tertiary, #1e2130)', 
                        padding: '0.5rem', 
                        borderRadius: '4px', 
                        margin: 0, 
                        whiteSpace: 'pre-wrap', 
                        color: 'var(--text-main)', 
                        fontSize: '0.85rem',
                        flex: 1,
                        maxHeight: '140px',
                        overflowY: 'auto'
                      }}>
                        {executionResult.stdin}
                      </pre>
                    </div>
                  )}

                  {executionResult.expectedOutput != null && executionResult.expectedOutput !== '' && (
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <strong style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                        Expected Output:
                      </strong>
                      <pre style={{ 
                        backgroundColor: 'var(--bg-tertiary, #1e2130)', 
                        padding: '0.5rem', 
                        borderRadius: '4px', 
                        margin: 0, 
                        whiteSpace: 'pre-wrap', 
                        color: 'var(--text-main)', 
                        fontSize: '0.85rem',
                        flex: 1,
                        maxHeight: '140px',
                        overflowY: 'auto'
                      }}>
                        {executionResult.expectedOutput}
                      </pre>
                    </div>
                  )}

                  {executionResult.stdout != null && executionResult.stdout !== '' && (
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <strong style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem', whiteSpace: 'nowrap' }}>
                        Actual Output (stdout):
                      </strong>
                      <pre style={{ 
                        backgroundColor: 'var(--bg-tertiary, #1e2130)', 
                        padding: '0.5rem', 
                        borderRadius: '4px', 
                        margin: 0, 
                        whiteSpace: 'pre-wrap', 
                        color: 'var(--text-main)', 
                        fontSize: '0.85rem',
                        flex: 1,
                        maxHeight: '140px',
                        overflowY: 'auto'
                      }}>
                        {executionResult.stdout}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              {/* Full-width stderr / compilation error below grid */}
              {executionResult.stderr && (
                <div style={{ marginTop: '0.4rem' }}>
                  <strong style={{ color: 'var(--error-color, #ef4444)', fontSize: '0.85rem', display: 'block', marginBottom: '0.25rem' }}>
                    stderr / compilation error:
                  </strong>
                  <pre style={{ 
                    backgroundColor: 'var(--bg-tertiary, #1e2130)', 
                    padding: '0.5rem', 
                    borderRadius: '4px', 
                    margin: 0, 
                    whiteSpace: 'pre-wrap', 
                    color: 'var(--error-color, #ef4444)', 
                    fontSize: '0.85rem',
                    maxHeight: '160px',
                    overflowY: 'auto'
                  }}>
                    {executionResult.stderr}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === 'submit' && submissionResult && (
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '0.6rem', 
                paddingBottom: '0.4rem', 
                borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.08))' 
              }}>
                <div style={{ 
                  fontWeight: 'bold', 
                  fontSize: '0.9rem', 
                  color: 
                    submissionResult.status === 'Accepted' ? 'var(--success-color, #22c55e)' : 
                    (submissionResult.status === 'Processing' || submissionResult.status === 'Submitting...') ? 'var(--text-muted)' : 
                    'var(--error-color, #ef4444)' 
                }}>
                  Submission Verdict: {submissionResult.status}
                </div>
                
                {submissionResult.totalCount !== undefined && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    Tests Passed: {submissionResult.passedCount} / {submissionResult.totalCount}
                  </div>
                )}
              </div>
              
              {(submissionResult.status === 'Processing' || submissionResult.status === 'Submitting...') && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Evaluating hidden test cases...
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
