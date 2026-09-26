import React, { useRef, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { MonacoBinding } from 'y-monaco';

const LANGUAGES = [
  { id: 'javascript', name: 'JavaScript' },
  { id: 'python', name: 'Python' },
  { id: 'java', name: 'Java' },
  { id: 'cpp', name: 'C++' },
  { id: 'c', name: 'C' }
];

export const CodeEditor = ({ language, setLanguage, yDoc, readOnly = false }) => {
  const editorRef = useRef(null);
  const bindingRef = useRef(null);

  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };

  const handleEditorMount = (editor, monaco) => {
    editorRef.current = editor;
    if (yDoc) {
      const type = yDoc.getText('sourceCode');
      bindingRef.current = new MonacoBinding(type, editor.getModel(), new Set([editor]), null);
    }
  };

  useEffect(() => {
    if (editorRef.current && yDoc) {
      // If yDoc changes, rebind
      if (bindingRef.current) {
        bindingRef.current.destroy();
      }
      const type = yDoc.getText('sourceCode');
      bindingRef.current = new MonacoBinding(type, editorRef.current.getModel(), new Set([editorRef.current]), null);
    }
    return () => {
      if (bindingRef.current) {
        bindingRef.current.destroy();
        bindingRef.current = null;
      }
    };
  }, [yDoc]);

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
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Collaborative Mode (Phase 8)</span>
      </div>
      
      <div className="editor-wrapper">
        <Editor
          height="100%"
          width="100%"
          theme="vs-dark"
          language={language}
          onMount={handleEditorMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineHeight: 22,
            padding: { top: 16 },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            readOnly: readOnly
          }}
        />
      </div>
    </div>
  );
};
