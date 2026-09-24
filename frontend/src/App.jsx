import { useState, useEffect } from 'react'
import './App.css'

function App() {
  const [health, setHealth] = useState(null)
  
  useEffect(() => {
    // Basic health check to the backend
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/health`)
      .then(res => res.json())
      .then(data => setHealth(data))
      .catch(err => setHealth({ error: err.message }))
  }, [])

  return (
    <div className="App">
      <h1>Real-Time Collaborative Coding & Interview Platform</h1>
      <p>Phase 0: Project Foundation</p>
      
      <div className="status-box">
        <h2>Backend Status:</h2>
        {health ? (
          <pre>{JSON.stringify(health, null, 2)}</pre>
        ) : (
          <p>Loading...</p>
        )}
      </div>
    </div>
  )
}

export default App
