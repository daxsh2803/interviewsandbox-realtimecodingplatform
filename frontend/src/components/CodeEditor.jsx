import React, { useRef, useEffect, useState } from 'react';
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
  const [editor, setEditor] = useState(null);
  const bindingRef = useRef(null);
  const [isBound, setIsBound] = useState(false);
  
  const handleLanguageChange = (e) => {
    setLanguage(e.target.value);
  };

  const handleEditorMount = (editorInstance) => {
    setEditor(editorInstance);
  };

  useEffect(() => {
    if (!editor || !yDoc) {
      setIsBound(false);
      return;
    }

    const type = yDoc.getText('sourceCode');
    const binding = new MonacoBinding(type, editor.getModel(), new Set([editor]), null);
    bindingRef.current = binding;
    setIsBound(true);

    return () => {
      binding.destroy();
      bindingRef.current = null;
      setIsBound(false);
    };
  }, [editor, yDoc]);

  return (
    <div className="code-editor-container" data-collaborative={isBound ? "ready" : "connecting"}>
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
