import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { interviewApi } from '../api/interviewApi';
import { getSocket } from '../api/socketClient';

export const InterviewReport = () => {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const reportData = await interviewApi.getReport(id);
        setReport(reportData);

        // Find user role
        import('../api/client').then(({ apiClient }) => {
          apiClient('/auth/me').then(res => {
            const participant = reportData.participants.find(p => p.id === res.user.id);
            if (participant) {
              setUserRole(participant.role);
            }
          });
        });

        if (reportData.notes !== undefined) {
          setNotes(reportData.notes || '');
        }

        const [subsData, snapsData] = await Promise.all([
          interviewApi.getSubmissions(id),
          interviewApi.getSnapshots(id)
        ]);

        setSubmissions(subsData.submissions || []);
        setSnapshots(snapsData.snapshots || []);

      } catch (err) {
        setError(err.message || 'Failed to fetch report');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();

    const socket = getSocket();
    if (socket) {
      socket.on('interview:report-updated', (payload) => {
        // Refresh data
        fetchReport();
      });
      return () => {
        socket.off('interview:report-updated');
      };
    }
  }, [id]);

  const handleSaveNotes = async () => {
    setIsSavingNotes(true);
    try {
      await interviewApi.updateNotes(id, notes);
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      alert('Failed to save notes: ' + err.message);
    } finally {
      setIsSavingNotes(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading report...</div>;
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>Error: {error}</div>;
  if (!report) return null;

  const isInterviewer = userRole === 'INTERVIEWER';

  return (
    <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Interview Report: {report.interview.title}</h1>
        <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div className="card">
          <h3>Metadata</h3>
          <p><strong>Status:</strong> {report.interview.status}</p>
          <p><strong>Scheduled:</strong> {new Date(report.interview.scheduled_at).toLocaleString()}</p>
          <p><strong>Started:</strong> {report.interview.started_at ? new Date(report.interview.started_at).toLocaleString() : 'N/A'}</p>
          <p><strong>Ended:</strong> {report.interview.ended_at ? new Date(report.interview.ended_at).toLocaleString() : 'N/A'}</p>
        </div>

        <div className="card">
          <h3>Statistics</h3>
          <p><strong>Code Executions:</strong> {report.stats.execution_count}</p>
          <p><strong>Code Submissions:</strong> {report.stats.submission_count}</p>
        </div>
      </div>

      <div className="card">
        <h3>Participants</h3>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Name</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Email</th>
              <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Role</th>
            </tr>
          </thead>
          <tbody>
            {report.participants.map(p => (
              <tr key={p.id}>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{p.name}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{p.email}</td>
                <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{p.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isInterviewer && (
        <div className="card">
          <h3>Interviewer Notes (Private)</h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: '100%', height: '150px', padding: '0.5rem', marginBottom: '1rem', border: '1px solid var(--border-color)', borderRadius: '4px' }}
            placeholder="Write private notes about this candidate..."
          />
          <button
            className="btn btn-primary"
            onClick={handleSaveNotes}
            disabled={isSavingNotes}
          >
            {isSavingNotes ? 'Saving...' : 'Save Notes'}
          </button>
          {notesSaved && <span style={{ marginLeft: '1rem', color: 'green' }}>Saved!</span>}
        </div>
      )}

      <div className="card">
        <h3>Submissions History</h3>
        {submissions.length === 0 ? <p>No submissions found.</p> : (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Time</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Language</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Status</th>
                <th style={{ borderBottom: '1px solid #ccc', padding: '0.5rem' }}>Passed</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => (
                <tr key={s.id}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{new Date(s.created_at).toLocaleString()}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{s.language}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                    <span style={{ color: s.status === 'Accepted' ? 'green' : (s.status === 'Processing' ? 'orange' : 'red') }}>
                      {s.status}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{s.passed_tests} / {s.total_tests}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Code Snapshots</h3>
        {snapshots.length === 0 ? <p>No snapshots recorded.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {snapshots.map(s => (
              <div key={s.id} style={{ border: '1px solid #eee', padding: '1rem', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong>{s.trigger_type}</strong>
                  <span>{new Date(s.created_at).toLocaleString()}</span>
                </div>
                <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '4px', overflowX: 'auto', margin: 0 }}>
                  <code>{s.snapshot_content}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};
