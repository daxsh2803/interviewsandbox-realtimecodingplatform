# Real-Time Collaborative Coding & Interview Platform

## Project Purpose
A production-style full-stack platform for technical interviews where an interviewer and candidate participate in a real-time collaborative coding session with multi-language execution, automated evaluation, and peer synchronization.

## Architecture
The platform follows a 3-tier architecture with dedicated distributed layers for real-time CRDT synchronization, ephemeral coordination, and sandboxed code execution:
- **PostgreSQL**: Authoritative relational persistence for users, interviews, problems, test cases, code executions, submissions, and interviewer notes.
- **Redis**: Distributed ephemeral state, Socket.io adapter for horizontal scaling, presence tracking, rate limiting, and distributed Yjs document update persistence (`yjs:updates:${interviewId}:${problemId}`).
- **Node.js / Express**: Stateless backend API, Socket.io WebSocket server, and Judge0 execution coordinator with automatic localhost polling fallback.
- **React / Vite**: Single-page application featuring the Monaco Editor, Yjs CRDT binding, tabbed execution console, and role-based participant controls.
- **Judge0 CE**: Sandboxed code execution engine evaluating user code against sample and hidden test cases.

## Technology Stack
- **Frontend:** React, Vite, Monaco Editor (`@monaco-editor/react`), Yjs, `y-monaco`
- **Backend:** Node.js, Express.js, Socket.io, `@socket.io/redis-adapter`, Yjs
- **Database:** PostgreSQL (`pg`)
- **Ephemeral State & Cache:** Redis (`redis`)
- **Execution Sandbox:** Judge0 API
- **Infrastructure:** Docker, Docker Compose, Nginx, Let's Encrypt Certbot
- **Testing:** Jest, Supertest

---

## Core Capabilities & Features

### 1. LeetCode-Style Execution Harness (`codeWrapper.js`)
- **Function-Only Submissions**: Candidates solve problems by writing clean, LeetCode-style function solutions without manual `stdin` parsing or `stdout` printing boilerplate.
- **Multi-Language Support**: Supported across **JavaScript**, **Python**, **C++**, and **Java** via per-problem `starter_code` and `driver_code` templates stored in JSONB columns (`005_add_starter_and_driver_code.sql`).
- **Template Placeholder Injection**: Driver templates use `{{USER_CODE}}` placeholders so languages like Java and C++ cleanly wrap candidate classes/functions with necessary imports, parsing drivers, and formatted outputs.
- **Backward Compatibility**: Inspects submitted code before wrapping. If the solution directly reads `stdin` (e.g., `readFileSync`, `readline`, `input()`, `sys.stdin`, `cin`, `Scanner`), defines an entry point (`int main`, `public static void main`), or runs direct debug snippets (`console.log(...)`, `print(...)`), the driver wrapper is bypassed and the code executes as-is.
- **Original Code Preservation**: The candidate's original unwrapped source code is recorded in `code_executions` and `submissions` tables—only the wrapped harness is dispatched to Judge0.

### 2. Tabbed Execution Console & Custom Input
- **Run Code vs. Submit**: Candidates test their solution against sample test cases via "Run Code", or run full automated grading against sample + hidden test cases via "Submit".
- **Custom Input**: An interactive `Custom Input` tab allows candidates to provide custom `stdin` values. A visual indicator highlights when custom input is active.
- **Transparent Output Display**: Side-by-side display of execution status, effective input (sample test case vs. custom input), expected output, and actual program output (`stdout` / `stderr`).
- **Expandable Console**: Quick expand/collapse toggle for full console inspection without crowding the code editor.

### 3. Yjs-Safe Collaborative Starter Templates
- **Hydration-Safe Auto-Fill**: Auto-inserts the problem's starter template only after initial Redis/Yjs synchronization completes (`isSynced = true`) and only when the editor is blank (`yText.length === 0`). Existing peer edits and hydrated sessions are never clobbered.
- **Smart Language Switching**: Switching languages smoothly replaces the starter template if the current code is unmodified or empty, preserving written code if modifications were made.
- **LF Line-Ending Enforcement**: Automatically enforces Monaco `EndOfLineSequence.LF` (`\n`) on Windows, eliminating character offset drift in `y-monaco`'s CR/LF translation.
- **Peer-Synced Reset**: A dedicated `Reset Starter` button wipes and re-inserts the clean starter template in sequential transactions, accompanied by a confirmation prompt if user edits are present.

### 4. Zero-Tunnel Local Development (Judge0 Polling Fallback)
- **Automatic Fallback**: Hosted Judge0 cannot deliver webhook callbacks to local environments (`http://localhost:5000/...`). When `JUDGE0_CALLBACK_URL` contains `localhost`/`127.0.0.1` or `JUDGE0_ENABLE_POLLING=true`, the backend automatically polls Judge0 (`GET /submissions/:token`) until terminal status (`status.id >= 3`).
- **Seamless Emission**: Polled results are routed through the exact same idempotent pipeline as webhooks, immediately emitting status updates to the frontend via Socket.io without requiring ngrok or public tunnels.

---

## Database Migrations

Database migrations are tracked in the `migrations` table and run sequentially from `backend/src/db/migrations/`:

| Migration | File | Description |
|---|---|---|
| `001` | `001_initial_schema.sql` | Core domain tables: `users`, `problems`, `test_cases`, `interviews`, `interview_participants`, `interview_problems`, `code_executions`. |
| `002` | `002_add_judge0_token.sql` | Adds `judge0_token` to `code_executions` for asynchronous execution tracking. |
| `003` | `003_submissions.sql` | Adds `submissions` and `submission_results` tables for full test suite evaluations. |
| `004a` | `004_add_problem_ownership.sql` | Adds `created_by` foreign key column to `problems` for user-owned problem management. |
| `004b` | `004_interviewer_notes.sql` | Adds `interviewer_notes` table for private interviewer candidate feedback. |
| `005` | `005_add_starter_and_driver_code.sql` | Adds `starter_code` and `driver_code` JSONB columns to `problems` for multi-language execution harnesses. |
| `006` | `006_add_stdin_to_code_executions.sql` | Adds `stdin` column to `code_executions` table for custom input persistence and auditing. |

---

## API Endpoints

### System & Health
- `GET /api/health` - Service health status

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Authenticate user; sets HTTP-only `auth_token` cookie
- `GET /api/auth/me` - Get authenticated user profile
- `POST /api/auth/logout` - Clear authentication cookie

### Problems
- `POST /api/problems` - Create problem (Requires Auth)
- `GET /api/problems` - List problems with pagination (Excludes `driver_code`)
- `GET /api/problems/:id` - Get problem details (Excludes `driver_code`)
- `PUT /api/problems/:id` - Update owned problem
- `DELETE /api/problems/:id` - Delete owned problem

### Interviews & Session Controls
- `POST /api/interviews` - Create interview (Creator assigned `INTERVIEWER` role)
- `GET /api/interviews` - List user's interviews
- `GET /api/interviews/:id` - Get interview metadata, participants, and assigned problems
- `POST /api/interviews/:id/participants` - Add participant (`CANDIDATE` or `INTERVIEWER`)
- `POST /api/interviews/:id/problems` - Assign problem to interview
- `DELETE /api/interviews/:id/problems/:problemId` - Remove problem from interview
- `PATCH /api/interviews/:id/status` - Update interview status (`WAITING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`)
- `POST /api/interviews/:id/lock` - Lock/unlock editor for candidates (INTERVIEWER only)
- `GET /api/interviews/:id/lock` - Get editor lock status
- `POST /api/interviews/:id/active-problem` - Set active problem for interview (INTERVIEWER only)
- `GET /api/interviews/:id/active-problem` - Get active problem

### Code Execution & Submissions
- `POST /api/interviews/:id/execute` - Execute code against sample test case or custom input (Rate limited: 5 req/10s)
- `POST /api/interviews/:id/problems/:problemId/submit` - Submit code against full test suite (hidden + sample) (Rate limited: 5 req/10s)
- `PUT /api/executions/judge0/callback` - Webhook callback receiver for Judge0 worker results
- `GET /api/interviews/:id/problems/:problemId/test-cases` - List problem test cases (INTERVIEWER only)
- `POST /api/interviews/:id/problems/:problemId/test-cases` - Create problem test case (INTERVIEWER only)
- `DELETE /api/interviews/:id/problems/:problemId/test-cases/:testCaseId` - Delete test case (INTERVIEWER only)

### Reports & Interviewer Notes
- `GET /api/interviews/:id/report` - Get interview summary report and statistics
- `GET /api/interviews/:id/submissions` - Get submission history for interview
- `GET /api/interviews/:id/snapshots` - Get code snapshots
- `GET /api/interviews/:id/notes` - Get interviewer evaluation notes (INTERVIEWER only)
- `PUT /api/interviews/:id/notes` - Create or update private interviewer evaluation notes (INTERVIEWER only)

---

## Environment Variables
The application uses the following environment variables (configured via `.env`):
- `PORT`: Backend server HTTP port (default: `5000`).
- `NODE_ENV`: Runtime environment (`development`, `production`, `test`).
- `DATABASE_URL`: Primary PostgreSQL connection string (e.g., `postgresql://postgres:postgres@localhost:5433/interview_db`).
- `TEST_DATABASE_URL`: Dedicated PostgreSQL connection string for automated testing (e.g., `postgresql://postgres:postgres@localhost:5433/interview_sandbox_test`). Isolates Jest integration tests from development data.
- `REDIS_URL`: Redis connection string for ephemeral state and Socket.io adapter (e.g., `redis://localhost:6379`).
- `JWT_SECRET`: Secret key used for signing authentication JWT cookies.
- `JUDGE0_BASE_URL`: Base URL for the Judge0 CE API (e.g., `https://ce.judge0.com` or `http://localhost:2358`).
- `JUDGE0_API_KEY`: RapidAPI or self-hosted API key for Judge0 (optional if unauthenticated).
- `JUDGE0_CALLBACK_URL`: Webhook URL for Judge0 execution callbacks (e.g., `http://localhost:5000/api/executions/judge0/callback` locally, or public IP / domain in production).
- `JUDGE0_CALLBACK_SECRET`: Secret header/query token for authenticating Judge0 callbacks.
- `JUDGE0_CPU_TIME_LIMIT` / `JUDGE0_WALL_TIME_LIMIT` / `JUDGE0_MEMORY_LIMIT`: Sandboxed resource constraints.
- `JUDGE0_ENABLE_POLLING`: Explicitly enables polling fallback for missed webhooks or local development (auto-enabled when `JUDGE0_CALLBACK_URL` is `localhost` / `127.0.0.1`).
- `VITE_API_URL`: Backend API URL consumed by the Vite frontend (e.g., `http://localhost:5000`).
- `VITE_SOCKET_URL`: WebSocket URL consumed by the frontend (e.g., `ws://localhost:5000`).

---

## Local Development & Setup

### Prerequisites
- Node.js (v18+)
- Docker and Docker Compose (or local PostgreSQL & Redis)

### Step-by-Step Setup

1. **Configure Environment:**
   ```bash
   cp .env.example .env
   ```

2. **Start Database & Ephemeral State (Docker):**
   ```bash
   docker compose up -d postgres redis
   ```
   *PostgreSQL listens on `localhost:5433`, Redis listens on `localhost:6379`.*

3. **Run Database Migrations & Seed Data:**
   ```bash
   npm --prefix backend run migrate
   npm --prefix backend run seed
   ```
   *The seed script populates 4 initial LeetCode problems (Two Sum, Reverse String, Valid Parentheses, Palindrome Number) with multi-language starter code, test drivers, and sample/hidden test cases.*

4. **Start Development Servers:**
   ```bash
   # Option A: Run concurrently from repository root
   npm run dev

   # Option B: Run in separate terminals
   npm --prefix backend run dev   # Port 5000
   npm --prefix frontend run dev  # Port 5173
   ```

5. **Access Applications:**
   - Frontend: [http://localhost:5173](http://localhost:5173)
   - Backend API: [http://localhost:5000/api](http://localhost:5000/api)

---

## Automated Testing & Verification

The backend test suite runs against a dedicated test database (`interview_sandbox_test`), completely isolated from development and seeded data.

```bash
# Run full backend test suite in-band
npm --prefix backend test

# Build frontend production bundle
npm --prefix frontend run build
```

### Test Suite Status
- **Test Suites:** 19 passed, 19 total
- **Tests:** 170 passed, 170 total
- **Handles:** 0 open handles (clean teardown across database pools, Redis clients, and polling timers)
- **Key Suites:**
  - `auth.test.js` - JWT authentication, bcrypt password hashing, HTTP-only cookies
  - `problem.test.js` - Problem CRUD, ownership checks, `starter_code` delivery, and `driver_code` confidentiality
  - `interview.test.js` - Participant authorization, problem assignments, and role checks
  - `execution.test.js` - Code wrapper execution, test case matching, and custom input handling
  - `judge0Polling.test.js` - Polling fallback lifecycle, terminal status resolution, and clean timer cancellation
  - `yjsManager.test.js` & `yjs_multi_instance.test.js` - CRDT hydration from Redis, multi-instance pub/sub sync, and deduplication
  - `rateLimiter.test.js` - Distributed IP auth rate limiter and per-user execution limits

---

## Continuous Integration (CI)
GitHub Actions is configured to run automated CI checks on every `push` to `main` and `pull_request` targeting `main`:
- Validates dependency installation (`npm ci`), runs the backend test suite using Jest, and compiles the frontend production build (`npm run build`).
- **Test Database Isolation**: Tests run against `interview_sandbox_test` (configured via `TEST_DATABASE_URL`). In CI environments where only `DATABASE_URL` is set, `initTestDb.js` safely falls back to `DATABASE_URL`.

---

## AWS EC2 Production Deployment

This project includes a production Docker Compose configuration (`docker-compose.prod.yml`) and Nginx TLS reverse proxy (`nginx/nginx.prod.conf`) for single-server AWS EC2 deployments with automated Let's Encrypt SSL.

### 1. Server Setup & Security Group
Provision an Ubuntu EC2 instance and configure inbound security group rules:
- **Port 80 (HTTP)**: Let's Encrypt ACME challenges & automatic 301 HTTPS redirection.
- **Port 443 (HTTPS)**: TLS 1.2/1.3 encrypted application traffic.
- **Port 22 (SSH)**: Administrative access.
*(Do **not** expose ports 5432, 6379, or 5000 to the public internet).*

### 2. Configuration (`.env`)
Clone the repository to your EC2 instance, copy `.env.example`, and set production variables:
- `POSTGRES_PASSWORD`: Strong database password.
- `DATABASE_URL`: `postgresql://postgres:<PASSWORD>@postgres:5432/interview_db`.
- `JWT_SECRET`: Cryptographically secure random secret.
- `JUDGE0_CALLBACK_SECRET`: Secret token for webhooks.
- `JUDGE0_CALLBACK_URL`: `http://<EC2-PUBLIC-IP-OR-DOMAIN>/api/executions/judge0/callback`.
- `VITE_FRONTEND_URL`: `https://<YOUR-DOMAIN>`.

### 3. Let's Encrypt Initial Certificate Setup
Ensure your domain's DNS A-record points to the EC2 public IP. Request the initial certificate in standalone mode before starting the frontend container:
```bash
docker compose -f docker-compose.prod.yml run --rm --entrypoint certbot -p 80:80 certbot certonly --standalone \
  --cert-name interview-sandbox \
  --email your-email@example.com \
  --agree-tos --no-eff-email \
  -d yourdomain.com -d www.yourdomain.com
```

### 4. Build, Start & Run Migrations
```bash
# Build and start services in background
docker compose -f docker-compose.prod.yml up --build -d

# Apply database migrations
docker compose -f docker-compose.prod.yml exec backend npm run migrate
```

### 5. Automated Certificate Renewal
The `certbot` container continuously checks and renews certificates every 12 hours via the shared ACME challenge webroot. To reload Nginx after renewal with zero downtime:
```bash
docker compose -f docker-compose.prod.yml exec frontend nginx -s reload
```
