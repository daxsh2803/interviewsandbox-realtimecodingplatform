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

## Current Project Status: Phase 5 — Frontend Foundation & Authentication UI
The platform has a functional PostgreSQL database schema, secure authentication, core REST APIs for managing problems and interviews, and a React frontend foundation with authentication flows.

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
  - `/dashboard`: Protected route requiring authentication, displays user profile and serves as the launchpad for interview rooms (upcoming).

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

## How to start PostgreSQL and Redis
1. Make sure Docker is running.
2. From the project root, run:
   ```bash
   docker-compose up -d
   ```

## How to start backend
1. Open a terminal in the `backend` directory.
2. Copy `.env.example` to `.env` in the root or `backend` folder.
3. Run `npm install`
4. Run `npm run dev`

## How to start frontend
1. Open a terminal in the `frontend` directory.
2. Copy `.env.example` to `.env`.
3. Run `npm install`
4. Run `npm run dev`

## Continuous Integration (CI)
GitHub Actions is configured to run automated CI checks:
- Triggers on every `push` to `main`.
- Triggers on every `pull_request` targeting `main`.
- Validates the current project foundation: verifies clean dependency installation (`npm ci`), verifies backend source code validity, and compiles the frontend production build.
- A failed CI workflow indicates an issue in the foundation that must be resolved before merging.
- Note: Automated test suites and linters are not yet configured in Phase 0; they will be integrated as feature phases introduce testable logic.

## Architecture Documentation
Detailed system architecture and technical design specifications are available in [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md).

