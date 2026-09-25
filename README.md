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

## Current Project Status: Phase 3 — Authentication & Authorization
The platform has a functional PostgreSQL database schema and secure backend authentication in place.
Authentication uses JWT stored in HTTP-only cookies.

### Authentication Endpoints
- `POST /api/auth/register`: Register with `{ name, email, password }`
- `POST /api/auth/login`: Login with `{ email, password }`. Sets HTTP-only `auth_token` cookie.
- `GET /api/auth/me`: Returns the current authenticated user's profile.
- `POST /api/auth/logout`: Clears the authentication cookie.

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

