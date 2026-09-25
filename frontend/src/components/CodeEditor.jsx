import React from 'react';
import Editor from '@monaco-editor/react';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
  { id: 'cpp', name: 'C++' },
  { id: 'c', name: 'C' }
];

export const CodeEditor = ({ language, setLanguage, sourceCode, setSourceCode }) => {
  
  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };

  return (
    <div className="code-editor-container">
      <div className="editor-toolbar">
        <select 
          className="form-input" 
          style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.875rem' }}
          value={language}
          onChange={handleLanguageChange}
        >
          {LANGUAGES.map(lang => (
            <option key={lang.id} value={lang.id}>{lang.name}</option>
          ))}
        </select>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Local mode only (Phase 6)</span>
      </div>
      
      <div className="editor-wrapper">
        <Editor
          height="100%"
          width="100%"
          theme="vs-dark"
          language={language}
          value={sourceCode}
          onChange={(value) => setSourceCode(value)}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 22,
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            wordWrap: 'on'
          }}
        />
      </div>
    </div>
  );
};
