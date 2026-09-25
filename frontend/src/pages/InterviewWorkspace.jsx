import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { interviewApi } from '../api/interviewApi';
import { WorkspaceHeader } from '../components/WorkspaceHeader';
import { ProblemPanel } from '../components/ProblemPanel';
import { CodeEditor } from '../components/CodeEditor';
import { ExecutionPanel } from '../components/ExecutionPanel';
import { useYjsProvider } from '../api/useYjsProvider';

export const InterviewWorkspace = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userRole, setUserRole] = useState(null);
  
  // Socket and Presence state
  const [socketStatus, setSocketStatus] = useState('Disconnected');
  const [participants, setParticipants] = useState([]); // Array of connected participants

  const [activeProblemId, setActiveProblemId] = useState(null);
  
  // Editor state
  const [language, setLanguage] = useState('javascript');

  useEffect(() => {
    let activeSocket = null;

    const fetchInterviewAndConnect = async () => {
      try {
        const data = await interviewApi.getInterviewById(id);
        const fetchedInterview = data.interview;
        setInterview(fetchedInterview);
        setUserRole('Participant'); 
        
        if (fetchedInterview.problems && fetchedInterview.problems.length > 0) {
          setActiveProblemId(fetchedInterview.problems[0].id);
        }

        // Connect Socket.io
        import('../api/socketClient').then(({ getSocket }) => {
          activeSocket = getSocket();
          
          activeSocket.on('connect', () => {
            setSocketStatus('Connected');
            activeSocket.emit('interview:join', { interviewId: id });
          });

          activeSocket.on('disconnect', () => {
            setSocketStatus('Disconnected');
          });

          activeSocket.on('interview:joined', (payload) => {
            console.log(payload.message);
          });

          activeSocket.on('interview:presence', (payload) => {
            setParticipants(prev => {
              if (payload.connected) {
                // Add or update
                const existing = prev.find(p => p.userId === payload.userId);
                if (existing) return prev;
                return [...prev, payload];
              } else {
                // Remove
                return prev.filter(p => p.userId !== payload.userId);
              }
            });
          });

          activeSocket.on('interview:error', (payload) => {
            setError(payload.message);
            activeSocket.disconnect();
          });

          activeSocket.connect();
        });

      } catch (err) {
        setError(err.message || 'Failed to load interview');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInterviewAndConnect();

    return () => {
      if (activeSocket) {
        activeSocket.emit('interview:leave');
        activeSocket.off('connect');
        activeSocket.off('disconnect');
        activeSocket.off('interview:joined');
        activeSocket.off('interview:presence');
        activeSocket.off('interview:error');
        activeSocket.disconnect();
      }
    };
  }, [id]);

  // Hook into Yjs doc for active problem
  const yDoc = useYjsProvider(id, activeProblemId, socketStatus);

  // Handle active problem change
  const handleProblemChange = (probId) => {
    setActiveProblemId(probId);
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
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-layout">
      <WorkspaceHeader 
        interview={interview} 
        userRole={userRole} 
        socketStatus={socketStatus}
        participants={participants}
      />
      
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
            yDoc={yDoc}
          />
          <ExecutionPanel />
        </div>
      </div>
    </div>
  );
}
