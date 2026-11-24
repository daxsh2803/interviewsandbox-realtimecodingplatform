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
- **Redis**: Ephemeral distributed coordination, Socket.io adapter, distributed presence tracking, and distributed Yjs document state persistence & cross-instance Pub/Sub synchronization.

### Distributed Yjs Architecture & Scalability
- **Redis State Persistence & Hydration**: Yjs document updates are persisted as an append-only list in Redis (`yjs:updates:${interviewId}:${problemId}`) with an extensible TTL. When any backend instance loads a document that is not present in its local memory, it transparently hydrates state from Redis before computing sync steps for clients. Concurrent hydration requests are deduplicated in-flight.
- **Cross-Instance Real-Time Convergence**: Local Yjs updates are published to Redis Pub/Sub (`yjs:sync:updates`) tagged with the originating `instanceId`. Peer instances apply remote updates using a dedicated transaction origin (`redis-pubsub`) to guarantee real-time CRDT convergence across instances without echo loops or redundant re-publishing.
- **Elimination of Sticky-Session Requirement**: Multi-instance deployments no longer require load balancer session affinity (sticky sessions) for collaborative editing. Participants connected to different backend instances seamlessly collaborate and converge to the exact same document state.
- **Redis Presence Orphan Limitation**: In the event of an ungraceful backend crash, Socket.io disconnect handlers will not fire, potentially leaving orphaned presence increments in Redis. This limitation is accepted as presence state is ephemeral and resets organically.

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
The `.env` file requires the following variables:
- `DATABASE_URL`: Primary PostgreSQL connection string for development and production (e.g., `postgresql://postgres:postgres@localhost:5433/interview_db`).
- `TEST_DATABASE_URL`: Dedicated PostgreSQL connection string for automated tests (e.g., `postgresql://postgres:postgres@localhost:5433/interview_sandbox_test`). Isolates Jest integration tests so development data and seeded problems are preserved across test runs.
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
- **Graceful Shutdown**: The backend server is configured to handle `SIGINT` and `SIGTERM` signals for graceful shutdown. It stops accepting new HTTP connections, cleanly disconnects Socket.io clients, and ends PostgreSQL and Redis connections with a 10s timeout to prevent hanging.
- **Rate Limiting**:
  - **Auth Routes (`/register`, `/login`)**: Protected by a Redis-backed distributed IP-based rate limiter (`ratelimit:auth:${ip}`) (default: 10 reqs / 15 mins). Limits sync across horizontally scaled backend instances and persist across process restarts. Sets standard rate-limit headers (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After`).
  - **Execution Routes (`/execute`, `/submit`)**: Protected by a Redis-based rate limiter per authenticated user (`ratelimit:execute:${userId}`) (default: 5 reqs / 10 secs).
  - **Reverse Proxy Client IP Resolution (`TRUST_PROXY`)**: Express `trust proxy` setting is configurable via `TRUST_PROXY` (defaulting to `1` for single-hop reverse proxies like Nginx and AWS ALB), ensuring `req.ip` reflects the real client IP.
  - Rate limits can be configured via environment variables (`AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`, `EXEC_RATE_LIMIT_WINDOW_MS`, `EXEC_RATE_LIMIT_MAX`, `TRUST_PROXY`).
- **Production Configuration Validation**: If `NODE_ENV=production`, the application will immediately crash on startup if critical environment variables (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`) are missing or using insecure fallback defaults.

## AWS EC2 Production Deployment

This project includes a production-ready Docker Compose configuration (`docker-compose.prod.yml`) intended for a single-server AWS EC2 deployment using Ubuntu Linux.

### 1. Server Setup

Provision an AWS EC2 instance (Ubuntu) and configure its Security Group to allow inbound traffic on:
- **Port 80 (HTTP)** for frontend access.
- **Port 22 (SSH)** for secure server management.

Do **not** open ports 5432, 6379, or 5000 to the internet. The production configuration correctly isolates these internal services on the Docker network.

Install Docker and Docker Compose on your EC2 instance.

### 2. Configuration (`.env`)

Clone the repository to your EC2 instance and create a production `.env` file from the example:
```bash
cp .env.example .env
```

Update the following critical environment variables for production:
- `POSTGRES_PASSWORD`: A strong password for the database.
- `DATABASE_URL`: Must match the PostgreSQL configuration. Ensure the password is URL-encoded if it contains special characters. Example: `postgresql://postgres:<URL_ENCODED_PASSWORD>@postgres:5432/interview_db`.
- `JWT_SECRET`: Generate a long, cryptographically secure random string.
- `JUDGE0_CALLBACK_SECRET`: Generate a secure string for webhooks.
- `JUDGE0_BASE_URL`: The URL of the public Judge0 API you are using.
- `JUDGE0_CALLBACK_URL`: Must be reachable by the public Judge0 instance. Do not use `localhost`. Set this to your EC2 instance's public IP address, e.g., `http://<EC2-PUBLIC-IP>/api/executions/judge0/callback`.
- `VITE_FRONTEND_URL`: Update to `http://<EC2-PUBLIC-IP>`.

*Note: Redis persistence has been disabled in the production configuration because it is only used for ephemeral rate limiting and Socket.io coordination. Redis data does not need to survive container restarts.*

### 3. Build and Start Production Services

The production Compose file ensures proper port bindings (`80:80`), limits exposed ports, and includes `restart: unless-stopped` policies.

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### 4. Database Setup & Migrations

To apply the initial PostgreSQL database schema, you must run the migration script inside the backend container after the services have started:

```bash
docker compose -f docker-compose.prod.yml exec backend npm run migrate
```
*(This command safely applies pending SQL files from `src/db/migrations` using a migrations tracking table. It is safe to run multiple times and prevents duplicate execution.)*

### 5. Production HTTPS / SSL Deployment (Let's Encrypt & Certbot)

Production deployments use `docker-compose.prod.yml` and `nginx/nginx.prod.conf` for TLS 1.2/1.3 termination, automatic HTTP-to-HTTPS redirection, security headers, and automated Let's Encrypt certificate renewal via Certbot.

#### Ingress & Security Architecture:
- **Port 80 (HTTP)**: Handles the Let's Encrypt ACME challenge path (`/.well-known/acme-challenge/`) for certificate issuance and renewal; returns a `301 Moved Permanently` redirect to HTTPS for all other traffic.
- **Port 443 (HTTPS)**: Terminates TLS 1.2/1.3 with secure cipher suites, sets HSTS (`Strict-Transport-Security`), `X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN`, proxies `/api/` and `/socket.io/` to the backend container with WebSocket upgrades (`Upgrade: websocket`, `Connection: upgrade`, `X-Forwarded-*`), and serves the SPA frontend.
- **Automated Certificate Renewal**: A dedicated `certbot` container runs a renewal daemon checking every 12 hours (`certbot renew`) against shared Docker volumes (`certbot_etc`, `certbot_var`, `certbot_www`).

#### Step-by-Step Initial SSL Certificate Setup:
1. Ensure your domain's DNS A-record points to your EC2 instance's public IP address.
2. Request the initial certificate using Certbot in standalone mode on port 80 **before starting the frontend container** (ensure port 80 is free):
   ```bash
   docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot -p 80:80 certbot certonly --standalone \
     --cert-name interview-sandbox \
     --email your-email@example.com \
     --agree-tos --no-eff-email \
     -d yourdomain.com -d www.yourdomain.com
   ```
   *(Note: Passing `--cert-name interview-sandbox` guarantees the certificate is generated under `/etc/letsencrypt/live/interview-sandbox/`, directly matching the paths pre-configured in `nginx/nginx.prod.conf`.)*

3. Build and start the full production stack:
   ```bash
   docker compose -f docker-compose.prod.yml up --build -d
   ```

4. Certificate Renewals & Nginx Reload:
   The `certbot` container continuously checks and renews certificates every 12 hours via the shared ACME challenge webroot (`certbot_www`). After a renewal occurs, reload Nginx with zero downtime:
   ```bash
   docker compose -f docker-compose.prod.yml exec frontend nginx -s reload
   ```

## Continuous Integration (CI)
GitHub Actions is configured to run automated CI checks:
- Triggers on every `push` to `main`.
- Triggers on every `pull_request` targeting `main`.
- Validates the current project foundation: verifies clean dependency installation (`npm ci`), verifies backend source code validity, and compiles the frontend production build.
- A failed CI workflow indicates an issue in the foundation that must be resolved before merging.
- The workflow automatically runs the backend test suite using Jest to ensure code correctness and prevent regressions.

### Automated Testing & Test Database Isolation
Backend integration tests run against a dedicated, isolated test database (`interview_sandbox_test`) configured via `TEST_DATABASE_URL`:
- **Run Tests**: `npm --prefix backend test` (automatically initializes and runs migrations against `interview_sandbox_test` if missing, then executes Jest).
- **Manual Setup**: `npm --prefix backend run db:test:setup` (creates `interview_sandbox_test` and applies pending migrations).
- **CI Compatibility**: In CI environments where only `DATABASE_URL` is set, tests safely fall back to `DATABASE_URL`.

## Architecture Documentation
Detailed system architecture and technical design specifications are available in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

