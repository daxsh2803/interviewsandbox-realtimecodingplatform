# Database Schema and Migrations (Phase 2)

This document outlines the PostgreSQL database schema and the migration mechanism used in the Real-Time Collaborative Coding & Interview Platform.

## Domain Entities

The core domain entities established for the platform are:

- **`users`**: Represents individuals using the platform (both candidates and interviewers). Stores authentication data and identity.
- **`problems`**: A catalog of coding problems that can be assigned during interviews.
- **`interviews`**: Represents a specific interview session. Tracks the status (`SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`) and temporal data (scheduled, started, ended times).
- **`interview_participants`**: A junction table linking `users` to `interviews` and assigning a specific `role` (`INTERVIEWER` or `CANDIDATE`) for that session.
- **`interview_problems`**: A junction table linking `interviews` and `problems`, allowing one interview to feature multiple problems, and a problem to belong to multiple interviews.
- **`interview_snapshots`**: Stores periodic or event-driven full-text snapshots of the collaborative code buffer.
- **`code_executions`**: Audit log of code execution runs submitted to Judge0, storing the source code, language, status, execution metrics, and outputs.

## Important Relationships

- **Interviews and Users**: A many-to-many relationship managed through `interview_participants`. An interview can have multiple candidates and interviewers.
- **Interviews and Problems**: A many-to-many relationship managed through `interview_problems`.
- **Interviews and Snapshots/Executions**: `interview_snapshots` and `code_executions` both strongly belong to an `interview_id`. If an interview is deleted, its snapshots and execution logs are deleted (via `ON DELETE CASCADE`).
- **Code Executions and Problems**: `code_executions` references `problem_id` so every execution clearly identifies which problem it was attempting to solve.

## Important Schema Decisions

- **UUIDs for Primary Keys**: `gen_random_uuid()` is used for all primary keys. UUIDs obscure the scale/growth of the platform, prevent predictable URL enumeration attacks, and simplify distributed data generation if the system scales to microservices later.
- **CHECK Constraints**: Domain integrity is enforced directly at the database level using `CHECK` constraints (e.g., limiting `status` values on `interviews`, `roles` on participants, and `trigger_type` on snapshots).
- **No Ephemeral State**: The schema intentionally excludes keystroke-level changes, cursor positions, and active participant presence. This data belongs in Redis and the Yjs document memory.
- **Role Assignment**: `role` is stored in `interview_participants` rather than the `users` table. This allows a user to be an interviewer in one session and a candidate in another.
- **Time Zones**: All timestamps use `TIMESTAMP WITH TIME ZONE` to prevent offset bugs when dealing with global interview scheduling.

## Migration Mechanism

A lightweight, custom migration runner is implemented in `backend/src/db/migrate.js`. 
- We chose a custom script over a heavyweight ORM (like Prisma or Sequelize) to keep the project lightweight, maintain raw SQL control, and adhere strictly to the `pg` driver requirement.
- The script automatically provisions a `migrations` tracking table.
- It scans `backend/src/db/migrations/` for `.sql` files.
- Files are executed sequentially in alphabetical order.
- Applied migrations are recorded so they are never executed twice (idempotency).
- Each migration is wrapped in a `BEGIN`/`COMMIT` transaction block to ensure atomicity.

### Running Migrations

To apply pending migrations, run the following command from the project root:

```bash
npm run migrate -w backend
```
