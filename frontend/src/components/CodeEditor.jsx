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

const normalizeLF = (str) => (typeof str === 'string' ? str.replace(/\r\n/g, '\n') : '');

export const CodeEditor = ({ language, setLanguage, yDoc, readOnly = false, activeProblem }) => {
  const [editor, setEditor] = useState(null);
  const bindingRef = useRef(null);
  const monacoRef = useRef(null);
  const [isBound, setIsBound] = useState(false);

  const handleEditorMount = (editorInstance, monacoInstance) => {
    setEditor(editorInstance);
    monacoRef.current = monacoInstance;
    const model = editorInstance?.getModel();
    if (model) {
      const eolLF = monacoInstance?.editor?.EndOfLineSequence?.LF ?? 0;
      model.setEOL(eolLF);
    }
  };

  // 1. Monaco Yjs Binding
  useEffect(() => {
    if (!editor || !yDoc) {
      setIsBound(false);
      return;
    }

    const model = editor.getModel();
    if (model) {
      const eolLF = monacoRef.current?.editor?.EndOfLineSequence?.LF ?? 0;
      model.setEOL(eolLF);
    }

    const type = yDoc.getText('sourceCode');
    const binding = new MonacoBinding(type, model, new Set([editor]), null);
    bindingRef.current = binding;
    setIsBound(true);

    return () => {
      binding.destroy();
      bindingRef.current = null;
      setIsBound(false);
    };
  }, [editor, yDoc]);

  // 2. Yjs-safe Auto-fill when problem is selected / assigned
  // Only auto-insert if initial Yjs sync has completed AND the editor is currently empty
  useEffect(() => {
    if (!yDoc || !activeProblem?.starter_code || yDoc.problemId !== activeProblem.id) return;

    const checkAndFillStarter = () => {
      if (readOnly) return;
      const rawStarter = activeProblem.starter_code[language];
      if (!rawStarter) return;
      const starterCode = normalizeLF(rawStarter);

      editor?.getModel()?.setEOL(0);

      const yText = yDoc.getText('sourceCode');
      const currentCode = normalizeLF(yText.toString());

      // Only insert if editor is currently empty (never clobber hydrated or peer edits)
      if (currentCode.trim() === '') {
        yDoc.transact(() => {
          if (yText.length > 0) yText.delete(0, yText.length);
        }, 'starter-auto-wipe');

        yDoc.transact(() => {
          yText.insert(0, starterCode);
        }, 'starter-auto-insert');
      }
    };

    const onSynced = () => {
      if (typeof yDoc.off === 'function') {
        yDoc.off('synced', onSynced);
      }
      checkAndFillStarter();
    };

    if (yDoc.isSynced) {
      checkAndFillStarter();
    } else {
      yDoc.on('synced', onSynced);
    }

    return () => {
      if (typeof yDoc.off === 'function') {
        yDoc.off('synced', onSynced);
      }
    };
  }, [yDoc, activeProblem, language, readOnly, editor]);

  // 3. Language switch with seamless starter code replacement if unmodified
  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);

    if (!yDoc || !activeProblem?.starter_code || readOnly) {
      return;
    }

    if (!yDoc.isSynced || yDoc.problemId !== activeProblem.id) {
      return;
    }

    editor?.getModel()?.setEOL(0);

    const yText = yDoc.getText('sourceCode');
    const currentCode = normalizeLF(yText.toString());
    const currentTrimmed = currentCode.trim();

    // Check if the editor is empty OR matches ANY of the problem's starter templates
    const starterTemplates = Object.values(activeProblem.starter_code).map(s => typeof s === 'string' ? normalizeLF(s).trim() : '');
    const isStarterOrEmpty = currentTrimmed === '' || starterTemplates.some(s => s && s === currentTrimmed);

    const rawStarter = activeProblem.starter_code[newLang];
    if (isStarterOrEmpty && rawStarter) {
      const newStarter = normalizeLF(rawStarter);
      yDoc.transact(() => {
        if (yText.length > 0) {
          yText.delete(0, yText.length);
        }
      }, 'starter-lang-wipe');

      yDoc.transact(() => {
        yText.insert(0, newStarter);
      }, 'starter-lang-insert');
    }
  };

  // 4. Reset to Starter Code handler with lightweight confirmation
  const handleResetStarter = () => {
    if (!yDoc || !activeProblem?.starter_code || readOnly) return;
    const rawStarter = activeProblem.starter_code[language];
    if (!rawStarter) return;
    const targetStarter = normalizeLF(rawStarter);

    editor?.getModel()?.setEOL(0);

    const yText = yDoc.getText('sourceCode');
    const currentCode = normalizeLF(yText.toString());

    // If editor contains modified code, prompt confirmation
    if (currentCode.trim() !== '' && currentCode.trim() !== targetStarter.trim()) {
      const confirmed = window.confirm('Reset code to starter template? Your current edits will be replaced.');
      if (!confirmed) return;
    }

    // Wipe first in one transaction, then insert cleanly in the next
    // to prevent y-monaco CRLF offset drift on replace
    yDoc.transact(() => {
      if (yText.length > 0) {
        yText.delete(0, yText.length);
      }
    }, 'starter-reset-wipe');

    yDoc.transact(() => {
      yText.insert(0, targetStarter);
    }, 'starter-reset-insert');
  };

  const hasStarter = Boolean(activeProblem?.starter_code?.[language]);

  return (
    <div className="code-editor-container" data-collaborative={isBound ? "ready" : "connecting"}>
      <div className="editor-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap' }}>
          <select 
            className="form-input" 
            style={{ width: 'auto', padding: '0.35rem 0.85rem', fontSize: '0.85rem' }}
            value={language}
            onChange={handleLanguageChange}
            disabled={readOnly}
          >
            {LANGUAGES.map(lang => (
              <option key={lang.id} value={lang.id}>{lang.name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleResetStarter}
            disabled={readOnly || !hasStarter}
            style={{
              width: 'auto',
              padding: '0.35rem 0.75rem',
              fontSize: '0.8rem',
              borderRadius: '4px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-tertiary, #2d3748)',
              color: (readOnly || !hasStarter) ? 'var(--text-muted)' : 'var(--text-main)',
              cursor: (readOnly || !hasStarter) ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
            title="Reset code to problem starter template"
          >
            <span>↺</span>
            <span>Reset Starter</span>
          </button>
        </div>

        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Collaborative Mode</span>
      </div>
      
      <div className="editor-wrapper" style={{ flex: 1, minHeight: 0 }}>
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
