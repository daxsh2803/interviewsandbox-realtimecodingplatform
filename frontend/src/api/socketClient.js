import { io } from 'socket.io-client';
import { API_BASE_URL } from './client';

let socket = null;

export const getSocket = () => {
  if (!socket) {
    // Extract base domain from API_BASE_URL (e.g. 'http://localhost:5000/api' -> 'http://localhost:5000')
    const socketUrl = API_BASE_URL.replace(/\/api$/, '');
    
    socket = io(socketUrl, {
      withCredentials: true,
      autoConnect: false, // We'll connect manually when entering the workspace
    });
  }
  return socket;
};
