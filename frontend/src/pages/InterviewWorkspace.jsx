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
  const [editorLocked, setEditorLocked] = useState(false);
  const [activities, setActivities] = useState([]);
  
  // Socket and Presence state
  const [socketStatus, setSocketStatus] = useState('Disconnected');
  const [participants, setParticipants] = useState([]);

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
        
        // Find current user's role from auth context (simplified: we check if they are interviewer)
        const currentUser = fetchedInterview.participants.find(p => p.role === 'INTERVIEWER') 
          || fetchedInterview.participants[0]; 
        // In a real app with auth context, we match by user ID. 
        // For this phase, we'll try to get it correctly from the backend by assuming backend verifies token.
        // Actually, let's fetch current user info or assume 'Participant' is default unless we fetch role.
        // Wait, `authApi.me()` could get user. Let's assume the user is INTERVIEWER if they created it, but we need real check.
        // I will use a simple check: if we can fetch lock, we are maybe interviewer?
        // Let's just rely on the API. The API returns `participants` with `id`. We don't have current userId.
        // I'll add an auth API call to get user role, but for now I'll just check if we can call lock endpoint.
        
        try {
          const lockData = await interviewApi.getLock(id);
          setEditorLocked(lockData.locked);
        } catch (e) {}

        try {
          const activeProbData = await interviewApi.getActiveProblem(id);
          if (activeProbData.problemId) {
            setActiveProblemId(activeProbData.problemId);
          } else if (fetchedInterview.problems && fetchedInterview.problems.length > 0) {
            setActiveProblemId(fetchedInterview.problems[0].id);
          }
        } catch (e) {
          if (fetchedInterview.problems && fetchedInterview.problems.length > 0) {
            setActiveProblemId(fetchedInterview.problems[0].id);
          }
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
                const existing = prev.find(p => p.userId === payload.userId);
                if (existing) return prev;
                return [...prev, payload];
              } else {
                return prev.filter(p => p.userId !== payload.userId);
              }
            });
          });

          activeSocket.on('interview:editor-lock', (payload) => setEditorLocked(true));
          activeSocket.on('interview:editor-unlock', (payload) => setEditorLocked(false));
          
          activeSocket.on('problem:pushed', (payload) => setActiveProblemId(payload.problemId));
          
          activeSocket.on('interview:ended', (payload) => {
            setInterview(prev => ({ ...prev, status: 'COMPLETED' }));
            setEditorLocked(true); // Ensure editor locks locally
          });

          activeSocket.on('interview:activity', (payload) => {
            setActivities(prev => [payload, ...prev].slice(0, 50));
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
    // Also fetch current user to know if they are interviewer. We'll fetch from /api/auth/me
    import('../api/client').then(({ apiClient }) => {
      apiClient('/auth/me').then(res => {
        apiClient(`/interviews/${id}`).then(intData => {
          const participant = intData.interview.participants.find(p => p.id === res.user.id);
          if (participant) setUserRole(participant.role);
        });
      }).catch(e => console.error(e));
    });

    return () => {
      if (activeSocket) {
        activeSocket.emit('interview:leave');
        activeSocket.off('connect');
        activeSocket.off('disconnect');
        activeSocket.off('interview:joined');
        activeSocket.off('interview:presence');
        activeSocket.off('interview:editor-lock');
        activeSocket.off('interview:editor-unlock');
        activeSocket.off('problem:pushed');
        activeSocket.off('interview:ended');
        activeSocket.off('interview:activity');
        activeSocket.off('interview:error');
        activeSocket.disconnect();
      }
    };
  }, [id]);

  const yDoc = useYjsProvider(id, activeProblemId, socketStatus);

  const handleProblemChange = async (probId) => {
    if (userRole === 'INTERVIEWER') {
      try {
        await interviewApi.setActiveProblem(id, probId);
        setActiveProblemId(probId);
      } catch (err) {
        console.error('Failed to set active problem:', err);
      }
    }
  };

  const toggleLock = async () => {
    try {
      await interviewApi.setLock(id, !editorLocked);
    } catch (err) {
      console.error('Failed to toggle lock:', err);
    }
  };

  const updateStatus = async (status) => {
    try {
      const res = await interviewApi.updateStatus(id, status);
      setInterview(prev => ({ ...prev, status: res.interview.status }));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
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

  const isCompleted = interview?.status === 'COMPLETED' || interview?.status === 'CANCELLED';

  return (
    <div className="workspace-layout">
      <WorkspaceHeader 
        interview={interview} 
        userRole={userRole} 
        socketStatus={socketStatus}
        participants={participants}
      />
      
      {userRole === 'INTERVIEWER' && (
        <div style={{ padding: '0.5rem 1rem', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <strong>Interviewer Controls:</strong>
          {interview.status === 'SCHEDULED' && (
            <button className="btn btn-success" onClick={() => updateStatus('IN_PROGRESS')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>Start Interview</button>
          )}
          {interview.status === 'IN_PROGRESS' && (
            <button className="btn btn-error" onClick={() => updateStatus('COMPLETED')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>End Interview</button>
          )}
          <button 
            className={`btn ${editorLocked ? 'btn-success' : 'btn-primary'}`} 
            onClick={toggleLock}
            disabled={isCompleted}
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
          >
            {editorLocked ? 'Unlock Editor' : 'Lock Editor'}
          </button>
          <div style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Activity Events: {activities.length > 0 ? `${activities[0].type} at ${new Date(activities[0].timestamp).toLocaleTimeString()}` : 'None'}
          </div>
        </div>
      )}

      {isCompleted && (
        <div style={{ padding: '0.5rem 1rem', background: 'var(--error-color)', color: 'white', textAlign: 'center', fontWeight: 'bold' }}>
          This interview has ended.
        </div>
      )}
      
      <div className="workspace-main">
        <div className="workspace-left">
          <ProblemPanel 
            problems={interview.problems} 
            activeProblemId={activeProblemId}
            onProblemChange={handleProblemChange}
            isInterviewer={userRole === 'INTERVIEWER'}
          />
        </div>
        
        <div className="workspace-right">
          <CodeEditor 
            language={language}
            setLanguage={setLanguage}
            yDoc={yDoc}
            readOnly={editorLocked || isCompleted}
          />
          <ExecutionPanel 
            yDoc={yDoc}
            language={language}
            interviewId={interview.id}
            problemId={activeProblemId}
            disabled={isCompleted}
          />
        </div>
      </div>
    </div>
  );
}
