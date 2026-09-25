import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { getSocket } from './socketClient';

export const useYjsProvider = (interviewId, problemId, socketStatus) => {
  const [doc, setDoc] = useState(null);
  
  useEffect(() => {
    if (!interviewId || !problemId || socketStatus !== 'Connected') {
      return;
    }

    const socket = getSocket();
    const ydoc = new Y.Doc();
    setDoc(ydoc);

    const onSyncStep2 = (payload) => {
      if (payload.interviewId === interviewId && payload.problemId === problemId) {
        Y.applyUpdate(ydoc, new Uint8Array(payload.update), 'socket');
      }
    };

    const onUpdate = (payload) => {
      if (payload.interviewId === interviewId && payload.problemId === problemId) {
        Y.applyUpdate(ydoc, new Uint8Array(payload.update), 'socket');
      }
    };

    const onYjsError = (payload) => {
      console.error('Yjs Error:', payload.message);
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
      socket.off('yjs:sync-step2', onSyncStep2);
      socket.off('yjs:update', onUpdate);
      socket.off('yjs:error', onYjsError);
      ydoc.off('update', handleLocalUpdate);
      ydoc.destroy();
    };
  }, [interviewId, problemId, socketStatus]);

  return doc;
};
