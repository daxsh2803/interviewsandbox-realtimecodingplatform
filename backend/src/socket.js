const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const config = require('./config');
const db = require('./db');

let io;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.VITE_FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    }
  });

  // Authentication Middleware
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.request.headers.cookie || '';
      const cookies = cookieHeader.split(';').reduce((acc, current) => {
        const [name, ...value] = current.trim().split('=');
        if (name) acc[name] = decodeURIComponent(value.join('='));
        return acc;
      }, {});
      
      const token = cookies.auth_token;

      if (!token) {
        return next(new Error('Authentication error: Missing token'));
      }

      const decoded = jwt.verify(token, config.jwtSecret);
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    // console.log(`Socket connected: ${socket.id}, User: ${socket.data.userId}`);

    // Join Interview Room
    socket.on('interview:join', async (payload) => {
      try {
        const { interviewId } = payload;
        const { userId } = socket.data;

        if (!interviewId) {
          return socket.emit('interview:error', { message: 'interviewId is required' });
        }

        // Verify participation
        const participantResult = await db.query(
          'SELECT role FROM interview_participants WHERE interview_id = $1 AND user_id = $2',
          [interviewId, userId]
        );

        if (participantResult.rows.length === 0) {
          return socket.emit('interview:error', { message: 'Unauthorized: Not a participant in this interview' });
        }

        const role = participantResult.rows[0].role;
        const roomName = `interview:${interviewId}`;

        // Store metadata
        socket.data.interviewId = interviewId;
        socket.data.role = role;

        // Join room
        socket.join(roomName);

        socket.emit('interview:joined', { message: 'Successfully joined the interview room' });

        // Broadcast presence
        socket.to(roomName).emit('interview:presence', {
          userId,
          role,
          connected: true,
        });

      } catch (err) {
        console.error('Socket interview:join error:', err);
        socket.emit('interview:error', { message: 'Internal server error during join' });
      }
    });

    // Leave Interview Room
    socket.on('interview:leave', () => {
      const { interviewId, userId, role } = socket.data;
      if (interviewId) {
        const roomName = `interview:${interviewId}`;
        socket.leave(roomName);
        socket.to(roomName).emit('interview:presence', {
          userId,
          role,
          connected: false,
        });
        
        socket.data.interviewId = null;
        socket.data.role = null;
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      const { interviewId, userId, role } = socket.data;
      if (interviewId) {
        const roomName = `interview:${interviewId}`;
        socket.to(roomName).emit('interview:presence', {
          userId,
          role,
          connected: false,
        });
      }
    });
  });

  return io;
};

const getIo = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIo };
