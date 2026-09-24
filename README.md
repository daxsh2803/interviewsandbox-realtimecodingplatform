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

## Current Project Status: Phase 0 — Project Foundation
The project currently has its structural foundation. It contains a minimal Express application with a health check, a minimal React/Vite application, and Docker Compose configuration for PostgreSQL and Redis.
Authentication, database models, live coding, and Judge0 are not yet implemented.

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

