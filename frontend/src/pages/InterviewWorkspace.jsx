import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { interviewApi } from '../api/interviewApi';
import { apiClient } from '../api/client';
import { getSocket } from '../api/socketClient';
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
  const [isInterviewJoined, setIsInterviewJoined] = useState(false);
  const [participants, setParticipants] = useState([]);

  const [activeProblemId, setActiveProblemId] = useState(null);
  
  // Editor state
  const [language, setLanguage] = useState('javascript');

  useEffect(() => {
    let isMounted = true;
    const activeSocket = getSocket();

    const handleConnect = () => {
      if (!isMounted) return;
      setSocketStatus('Connected');
      setIsInterviewJoined(false);
      activeSocket.emit('interview:join', { interviewId: id });
    };

    const handleDisconnect = () => {
      if (!isMounted) return;
      setSocketStatus('Disconnected');
      setIsInterviewJoined(false);
    };

    const handleInterviewJoined = (payload) => {
      if (!isMounted) return;
      console.log(payload?.message);
      setIsInterviewJoined(true);
    };

    const handlePresence = (payload) => {
      if (!isMounted) return;
      setParticipants(prev => {
        if (payload.connected) {
          const existing = prev.find(p => p.userId === payload.userId);
          if (existing) return prev;
          return [...prev, payload];
        } else {
          return prev.filter(p => p.userId !== payload.userId);
        }
      });
    };

    const handleEditorLock = () => isMounted && setEditorLocked(true);
    const handleEditorUnlock = () => isMounted && setEditorLocked(false);
    const handleProblemPushed = (payload) => isMounted && setActiveProblemId(payload.problemId);
    const handleInterviewEnded = () => {
      if (!isMounted) return;
      setInterview(prev => ({ ...prev, status: 'COMPLETED' }));
      setEditorLocked(true);
    };
    const handleActivity = (payload) => {
      if (!isMounted) return;
      setActivities(prev => [payload, ...prev].slice(0, 50));
    };
    const handleError = (payload) => {
      if (!isMounted) return;
      setError(payload?.message);
      setIsInterviewJoined(false);
      activeSocket.disconnect();
    };

    activeSocket.on('connect', handleConnect);
    activeSocket.on('disconnect', handleDisconnect);
    activeSocket.on('interview:joined', handleInterviewJoined);
    activeSocket.on('interview:presence', handlePresence);
    activeSocket.on('interview:editor-lock', handleEditorLock);
    activeSocket.on('interview:editor-unlock', handleEditorUnlock);
    activeSocket.on('problem:pushed', handleProblemPushed);
    activeSocket.on('interview:ended', handleInterviewEnded);
    activeSocket.on('interview:activity', handleActivity);
    activeSocket.on('interview:error', handleError);

    const fetchInterviewAndConnect = async () => {
      try {
        const [data, meData] = await Promise.all([
          interviewApi.getInterviewById(id),
          apiClient('/auth/me')
        ]);
        if (!isMounted) return;
        const fetchedInterview = data.interview;
        setInterview(fetchedInterview);
        
        const participant = fetchedInterview.participants?.find(p => p.id === meData?.user?.id);
        if (participant) {
          setUserRole(participant.role);
        }
        
        try {
          const lockData = await interviewApi.getLock(id);
          if (isMounted) setEditorLocked(lockData.locked);
        } catch (e) {}

        try {
          const activeProbData = await interviewApi.getActiveProblem(id);
          if (!isMounted) return;
          if (activeProbData.problemId) {
            setActiveProblemId(activeProbData.problemId);
          } else if (fetchedInterview.problems && fetchedInterview.problems.length > 0) {
            setActiveProblemId(fetchedInterview.problems[0].id);
          }
        } catch (e) {
          if (isMounted && fetchedInterview.problems && fetchedInterview.problems.length > 0) {
            setActiveProblemId(fetchedInterview.problems[0].id);
          }
        }

        if (activeSocket.connected) {
          handleConnect();
        } else {
          activeSocket.connect();
        }

      } catch (err) {
        if (isMounted) setError(err.message || 'Failed to load interview');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchInterviewAndConnect();

    return () => {
      isMounted = false;
      activeSocket.emit('interview:leave');
      activeSocket.off('connect', handleConnect);
      activeSocket.off('disconnect', handleDisconnect);
      activeSocket.off('interview:joined', handleInterviewJoined);
      activeSocket.off('interview:presence', handlePresence);
      activeSocket.off('interview:editor-lock', handleEditorLock);
      activeSocket.off('interview:editor-unlock', handleEditorUnlock);
      activeSocket.off('problem:pushed', handleProblemPushed);
      activeSocket.off('interview:ended', handleInterviewEnded);
      activeSocket.off('interview:activity', handleActivity);
      activeSocket.off('interview:error', handleError);
      activeSocket.disconnect();
      setIsInterviewJoined(false);
    };
  }, [id]);

  const yDoc = useYjsProvider(id, activeProblemId, socketStatus, isInterviewJoined);

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
    <div className="workspace-layout" data-joined={isInterviewJoined}>
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
            readOnly={(userRole !== 'INTERVIEWER' && editorLocked) || isCompleted}
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
