import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { interviewApi } from '../api/interviewApi';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { ProblemPanel } from '../components/ProblemPanel';
import { CodeEditor } from '../components/CodeEditor';
import { ExecutionPanel } from '../components/ExecutionPanel';

// Temporary local state structure for phase 6
const DEFAULT_CODE = {
  javascript: '// Write your JavaScript code here\n',
  python: '# Write your Python code here\n',
  java: '// Write your Java code here\n',
  cpp: '// Write your C++ code here\n',
  c: '// Write your C code here\n',
};

export const InterviewWorkspace = () => {
  const { id } = useParams();
  
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const [activeProblemId, setActiveProblemId] = useState(null);
  
  // Editor state
  const [language, setLanguage] = useState('javascript');
  const [problemCodeState, setProblemCodeState] = useState({}); // { [problemId]: { [lang]: code } }

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const data = await interviewApi.getInterviewById(id);
        const fetchedInterview = data.interview;
        setInterview(fetchedInterview);
        
        // Extract role (assuming current user is one of the participants returned by backend)
        // Note: The backend getInterviewById returns `interview.participants`. 
        // We can just rely on the API access succeeding. We don't strictly need the role for authorization (backend handles it),
        // but we display it if we can find it, or we leave it blank.
        // Actually backend `getInterviews` returns role, `getInterviewById` doesn't explicitly return the current user's role separately unless we look it up.
        // For now, let's leave it as generic participant or extract if easy.
        setUserRole('Participant'); 
        
        if (fetchedInterview.problems && fetchedInterview.problems.length > 0) {
          setActiveProblemId(fetchedInterview.problems[0].id);
        }
      } catch (err) {
        setError(err.message || 'Failed to load interview');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInterview();
  }, [id]);

  // Handle active problem change and default code initialization
  const handleProblemChange = (probId) => {
    setActiveProblemId(probId);
  };

  const currentCode = problemCodeState[activeProblemId]?.[language] ?? DEFAULT_CODE[language];

  const handleCodeChange = (newCode) => {
    setProblemCodeState(prev => ({
      ...prev,
      [activeProblemId]: {
        ...(prev[activeProblemId] || {}),
        [language]: newCode
      }
    }));
  };

  if (loading) {
    return (
      <div className="loader-container">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-center min-h-screen">
        <div className="glass-card" style={{ textAlign: 'center' }}>
          <h2>Access Error</h2>
          <div className="alert alert-error">{error}</div>
          <button className="btn btn-primary" onClick={() => window.location.href = '/dashboard'}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-layout">
      <WorkspaceHeader interview={interview} userRole={userRole} />
      
      <div className="workspace-main">
        <div className="workspace-left">
          <ProblemPanel 
            problems={interview.problems} 
            activeProblemId={activeProblemId}
            onProblemChange={handleProblemChange}
          />
        </div>
        
        <div className="workspace-right">
          <CodeEditor 
            language={language}
            setLanguage={setLanguage}
            sourceCode={currentCode}
            setSourceCode={handleCodeChange}
          />
          <ExecutionPanel />
        </div>
      </div>
    </div>
  );
};
