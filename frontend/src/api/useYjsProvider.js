import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getSocket } from './socketClient';

export const useYjsProvider = (interviewId, problemId, socketStatus, isInterviewJoined) => {
  const [doc, setDoc] = useState(null);
  
  useEffect(() => {
    if (!interviewId || !problemId || socketStatus !== 'Connected' || !isInterviewJoined) {
      return;
    }

    const socket = getSocket();
    const ydoc = new Y.Doc();
    ydoc.isSynced = false;
    ydoc.problemId = problemId;
    setDoc(ydoc);

    let syncTimeout = null;

    const markSynced = () => {
      if (!ydoc.isSynced) {
        ydoc.isSynced = true;
        ydoc.emit('synced', [true]);
      }
    };

    const onSyncStep2 = (payload) => {
      if (payload.interviewId === interviewId && payload.problemId === problemId) {
        if (payload.update && payload.update.length > 0) {
          Y.applyUpdate(ydoc, new Uint8Array(payload.update), 'socket');
        }
        markSynced();
      }
    };

    const onUpdate = (payload) => {
      if (payload.interviewId === interviewId && payload.problemId === problemId) {
        Y.applyUpdate(ydoc, new Uint8Array(payload.update), 'socket');
      }
    };

    const onYjsError = (payload) => {
      console.error('Yjs Error:', payload.message);
      markSynced();
    };

    socket.on('yjs:sync-step2', onSyncStep2);
    socket.on('yjs:update', onUpdate);
    socket.on('yjs:error', onYjsError);

    // Initial sync
    const stateVector = Y.encodeStateVector(ydoc);
    socket.emit('yjs:sync-step1', {
      interviewId,
      problemId,
      stateVector: Array.from(stateVector)
    });

    // Safety fallback: if sync response isn't received within 1500ms, mark synced
    syncTimeout = setTimeout(() => {
      markSynced();
    }, 1500);

    // Send local updates to server
    const handleLocalUpdate = (update, origin) => {
      if (origin !== 'socket') { // Prevent echo loop
        socket.emit('yjs:update', {
          interviewId,
          problemId,
          update: Array.from(update)
        });
      }
    };

    ydoc.on('update', handleLocalUpdate);

    return () => {
      if (syncTimeout) clearTimeout(syncTimeout);
      socket.off('yjs:sync-step2', onSyncStep2);
      socket.off('yjs:update', onUpdate);
      socket.off('yjs:error', onYjsError);
      ydoc.off('update', handleLocalUpdate);
      ydoc.destroy();
      setDoc(null);
    };
  }, [interviewId, problemId, socketStatus, isInterviewJoined]);

  return doc;
};
