import React, { useState, useEffect } from 'react';
import { problemApi } from '../api/problemApi';
import { interviewApi } from '../api/interviewApi';

export const ProblemPanel = ({
  problems = [],
  activeProblemId,
  onProblemChange,
  isInterviewer,
  interviewId,
  onProblemAssigned
}) => {
  const [showModal, setShowModal] = useState(false);
  const [bankProblems, setBankProblems] = useState([]);
  const [loadingBank, setLoadingBank] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [modalError, setModalError] = useState(null);

  useEffect(() => {
    if (showModal) {
      const fetchBank = async () => {
        setLoadingBank(true);
        setModalError(null);
        try {
          const data = await problemApi.getProblems();
          setBankProblems(data.problems || []);
        } catch (err) {
          setModalError(err.message || 'Failed to load problems from bank');
        } finally {
          setLoadingBank(false);
        }
      };
      fetchBank();
    }
  }, [showModal]);

  const handleAssign = async (problemId) => {
    if (!interviewId || assigningId) return;
    setAssigningId(problemId);
    setModalError(null);
    try {
      await interviewApi.assignProblem(interviewId, problemId);
      setShowModal(false);
      if (onProblemAssigned) {
        await onProblemAssigned(problemId);
      }
    } catch (err) {
      setModalError(err.message || 'Failed to assign problem');
    } finally {
      setAssigningId(null);
    }
  };

  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowModal(false);
        }}
      >
        <div
          className="glass-card"
          style={{
            width: '100%',
            maxWidth: '650px',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            padding: '2rem'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem'
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1.3rem' }}>Assign Problem from Bank</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Select a problem from the question bank to assign to this interview.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowModal(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '1.5rem',
                cursor: 'pointer',
                lineHeight: 1
              }}
            >
              &times;
            </button>
          </div>

          {modalError && <div className="alert alert-error">{modalError}</div>}

          <div
            style={{
              overflowY: 'auto',
              flex: 1,
              paddingRight: '0.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}
          >
            {loadingBank ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem', justifyContent: 'center' }}>
                <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '2px' }}></div>
                <span>Loading problem bank...</span>
              </div>
            ) : bankProblems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                No problems available in the bank. Run the seed script to populate starter problems.
              </div>
            ) : (
              bankProblems.map((prob) => {
                const isAssigned = problems.some((p) => p.id === prob.id);
                return (
                  <div
                    key={prob.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '1rem'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-main)' }}>
                          {prob.title}
                        </span>
                        <span className={`difficulty-badge difficulty-${prob.difficulty.toLowerCase()}`}>
                          {prob.difficulty}
                        </span>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '0.85rem',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {prob.description}
                      </p>
                    </div>

                    <div>
                      {isAssigned ? (
                        <span
                          style={{
                            fontSize: '0.85rem',
                            padding: '0.35rem 0.75rem',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          Assigned
                        </span>
                      ) : (
                        <button
                          className="btn btn-primary"
                          disabled={assigningId === prob.id}
                          onClick={() => handleAssign(prob.id)}
                          style={{
                            width: 'auto',
                            padding: '0.4rem 1rem',
                            fontSize: '0.85rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {assigningId === prob.id ? 'Assigning...' : 'Assign'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  };

  if (!problems || problems.length === 0) {
    return (
      <div className="problem-panel">
        <div style={{ padding: '2rem', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: isInterviewer ? '1.5rem' : 0 }}>
            No problems assigned to this interview yet.
          </p>
          {isInterviewer && (
            <button
              className="btn btn-primary"
              style={{ width: 'auto', padding: '0.5rem 1.25rem' }}
              onClick={() => setShowModal(true)}
            >
              + Assign Problem from Bank
            </button>
          )}
        </div>
        {isInterviewer && renderModal()}
      </div>
    );
  }

  const activeProblem = problems.find((p) => p.id === activeProblemId) || problems[0];

  return (
    <div className="problem-panel">
      <div
        className="problem-tabs"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', overflowX: 'auto', flex: 1 }}>
          {problems.map((p) => (
            <button
              key={p.id}
              className={`problem-tab ${activeProblemId === p.id ? 'active' : ''} ${!isInterviewer ? 'disabled' : ''}`}
              onClick={() => isInterviewer && onProblemChange(p.id)}
              disabled={!isInterviewer}
            >
              {p.title}
            </button>
          ))}
        </div>

        {isInterviewer && (
          <button
            className="btn btn-primary"
            style={{
              width: 'auto',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              margin: '0 0.5rem',
              whiteSpace: 'nowrap'
            }}
            onClick={() => setShowModal(true)}
          >
            + Assign Problem
          </button>
        )}
      </div>

      <div className="problem-content">
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{activeProblem.title}</h2>
        <span className={`difficulty-badge difficulty-${activeProblem.difficulty.toLowerCase()}`}>
          {activeProblem.difficulty}
        </span>

        <div
          className="problem-description"
          style={{ marginTop: '1.5rem', whiteSpace: 'pre-wrap', lineHeight: '1.6' }}
        >
          {activeProblem.description}
        </div>
      </div>

      {isInterviewer && renderModal()}
    </div>
  );
};
