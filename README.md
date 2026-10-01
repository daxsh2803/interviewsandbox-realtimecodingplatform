# Real-Time Collaborative Coding & Interview Platform

## Project Purpose
A production-style full-stack platform for technical interviews where an interviewer and candidate can participate in a real-time collaborative coding session.

## Current Architecture
The architecture follows a standard 3-tier model with specialized components for real-time collaboration and code execution. 
- **PostgreSQL** is the persistent source of truth.
- **Redis** is used for ephemeral state.
- **Node.js/Express.js** acts as a stateless backend API.
- **React/Vite** acts as the frontend SPA.

## Current Technology Stack
- **Frontend:** React, Vite, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL
- **Ephemeral state:** Redis
- **Infrastructure:** Docker, Docker Compose

## Current Project Status: Phase 9 — Redis / Distributed Real-Time State
The platform has a functional PostgreSQL database schema, secure authentication, core REST APIs, a React frontend foundation, a Socket.io real-time transport layer, and a collaborative code editor powered by Yjs. We have introduced Redis as the ephemeral distributed state layer and prepared Socket.io for multi-instance operation.

### Architecture Boundaries
- **PostgreSQL**: Persistent domain state (authoritative truth for domain models, auth, and problem metadata).
- **Yjs**: Live collaborative document state (in-memory, synchronized across clients).
- **Socket.io**: Real-time transport (WebSockets + polling fallback).
- **Redis**: Ephemeral distributed coordination + Socket.io adapter (used for multi-instance pub/sub and distributed presence tracking).

*Note: Redis does NOT persist Yjs source code or collaborative document contents. Yjs documents remain process-local.*

### Phase 9 Known Limitations & Deployment Requirements
- **Multi-Instance Yjs Limitation**: Because Yjs state remains process-local (in-memory Map) and is not persisted in Redis, instances do not automatically share Y.Doc state. 
- **Sticky-Session Requirement**: Due to the above limitation, multi-instance deployments require load balancer session affinity (sticky sessions) keyed by `interviewId` to ensure all participants of a specific interview converge on the same backend process.
- **Redis Presence Orphan Limitation**: In the event of an ungraceful backend crash, Socket.io disconnect handlers will not fire, potentially leaving orphaned presence increments in Redis. This limitation is accepted for Phase 9 as the state is ephemeral and resets organically.

### Authentication Endpoints
- `POST /api/auth/register`: Register with `{ name, email, password }`
- `POST /api/auth/login`: Login with `{ email, password }`. Sets HTTP-only `auth_token` cookie.
- `GET /api/auth/me`: Returns the current authenticated user's profile.
- `POST /api/auth/logout`: Clears the authentication cookie.

### Problem Endpoints
- `POST /api/problems`: Create a new problem (Requires Auth)
- `GET /api/problems`: List all problems (Requires Auth)
- `GET /api/problems/:id`: Get specific problem (Requires Auth)
- `PUT /api/problems/:id`: Update a problem (Requires Auth)
- `DELETE /api/problems/:id`: Delete a problem (Requires Auth)

### Interview Endpoints
- `POST /api/interviews`: Create an interview (User becomes INTERVIEWER)
- `GET /api/interviews`: List interviews the user is a participant of
- `GET /api/interviews/:id`: Get interview details (Requires participant role)
- `POST /api/interviews/:id/participants`: Add user to interview (Requires INTERVIEWER role)
- `POST /api/interviews/:id/problems`: Assign problem to interview (Requires INTERVIEWER role)
- `DELETE /api/interviews/:id/problems/:problemId`: Remove problem from interview (Requires INTERVIEWER role)
- `PATCH /api/interviews/:id/status`: Update interview status (Requires INTERVIEWER role)

### Frontend Architecture & Routing
The frontend is built with React, Vite, and React Router, featuring a custom vanilla CSS design system (glassmorphism & dark mode).
- **Global AuthContext**: Manages user state, login, registration, and logout. Automatically verifies session on load via `/api/auth/me`.
- **API Client**: A centralized Axios-style fetch wrapper that natively includes HTTP-only credentials.
- **Routes**:
  - `/login`: Public route for user authentication.
  - `/register`: Public route for account creation.
  - `/dashboard`: Protected route requiring authentication, displays user profile and scheduled interviews.
  - `/interviews/:id`: Protected workspace environment containing the coding interface.

### Workspace & Editor Configuration
- **Monaco Editor**: Integrated `@monaco-editor/react`. Currently supports JavaScript, Python, Java, C++, and C for syntax highlighting.
- **Problem Panel**: Fetches and renders problems assigned to the specific interview.
- **Execution Panel**: UI placeholders for code execution, indicating future integration points with Judge0.
### Socket.io Real-Time Architecture & Yjs Collaboration
- **Transport**: `socket.io` provides real-time bi-directional transport natively bridging with the Express HTTP server.
- **Authentication**: JWT is securely transferred via HTTP-only cookie automatically during handshake. Unauthenticated socket connections are rejected.
- **Authorization**: The server explicitly checks `interview_participants` in PostgreSQL before permitting a socket to join a room (`interview:<id>`).
- **Presence**: Tracks and broadcasts connected users (`interview:presence`). Currently in-memory and limited to a single backend instance (Redis integration pending).
- **Yjs State Synchronization**: 
  - Collaborative source code editing is powered by Yjs.
  - The backend maintains an in-memory `Y.Doc` mapped by `interviewId:problemId`.
  - Initial connection uses state vectors (`yjs:sync-step1`, `yjs:sync-step2`) for convergence.
  - Granular updates are sent via `yjs:update` natively bridging over Socket.io.
  - `y-monaco` natively binds the Yjs shared type (`Y.Text("sourceCode")`) to the Monaco editor instances.
  - *Note: PostgreSQL is explicitly NOT updated on every keystroke. Snapshots, Redis distributed coordination, WebRTC, and code execution are pending.*

### Authentication & Authorization Design
- **Passwords** are securely hashed using `bcryptjs` and never stored in plaintext.
- **JWTs** do not store sensitive information (e.g., passwords).
- **Cookies** are used to transport JWTs with `httpOnly`, `secure` (in prod), and `sameSite` flags.
- **Role-based Authorization** is implemented via middleware to restrict access based on user roles within specific interviews (`interview_participants` table), rather than global user roles.

### Environment Variables
The `.env` file requires the following authentication variable:
- `JWT_SECRET`: Secret used to sign JSON Web Tokens. Must be kept secure and configured per environment.

## Development Prerequisites
- Node.js (v18+)
- Docker and Docker Compose

## How to Run the Full Stack Locally (Docker)
We use Docker Compose to run the entire application stack locally (Frontend, Backend, PostgreSQL, Redis).

### Prerequisites
- Docker and Docker Compose
- Node.js (only for local development outside Docker)

### Startup Instructions
1. Copy the environment template to create your local `.env` file:
   ```bash
   cp .env.example .env
   ```
   *(Note: Populate `JWT_SECRET` and other placeholders as needed for testing).*

2. Build and start the stack:
   ```bash
   docker compose up --build -d
   ```

3. Access the application:
   - **Frontend**: [http://localhost:8080](http://localhost:8080)
   - **Backend API**: [http://localhost:5000/api](http://localhost:5000/api)

4. To view logs for a specific service (e.g., backend):
   ```bash
   docker compose logs -f backend
   ```

5. To stop the stack:
   ```bash
   docker compose down
   ```

### Data Persistence and Reset
- The database and Redis data are preserved in Docker volumes (`postgres_data`, `redis_data`).
- To completely reset the database and ephemeral state, run:
  ```bash
  docker compose down -v
  ```

### Limitations & Caveats
- **Local Container Testing vs Public Deployment**: This `docker-compose.yml` binds PostgreSQL and Redis to your local machine's ports (`5433` and `6379`) for easy debugging. In a true production environment, these ports should **not** be exposed to the public internet.
- **Frontend Build Configuration**: The frontend (`interview_frontend`) uses a multi-stage Docker build and is served statically by Nginx. The Nginx reverse proxy routes `/api` and `/socket.io` directly to the backend container. Because Vite variables are embedded at build time, `VITE_API_URL=/api` is passed as a build argument in the Dockerfile.
- **Yjs State**: Collaborative coding sessions (Yjs documents) are stored in-memory on the backend. Restarting the backend container will clear active coding sessions.
- **Judge0 Webhooks**: If you are using a public Judge0 instance (e.g., the public API), it will not be able to reach your `localhost` backend to deliver execution webhooks. To test Judge0 execution locally, either self-host Judge0 on the same Docker network or use a tunneling service (like ngrok) and update `JUDGE0_CALLBACK_URL` in `.env`.

## Continuous Integration (CI)
GitHub Actions is configured to run automated CI checks:
- Triggers on every `push` to `main`.
- Triggers on every `pull_request` targeting `main`.
- Validates the current project foundation: verifies clean dependency installation (`npm ci`), verifies backend source code validity, and compiles the frontend production build.
- A failed CI workflow indicates an issue in the foundation that must be resolved before merging.
- Note: Automated test suites and linters are not yet configured in Phase 0; they will be integrated as feature phases introduce testable logic.

## Architecture Documentation
Detailed system architecture and technical design specifications are available in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

