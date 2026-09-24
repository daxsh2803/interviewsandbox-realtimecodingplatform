# Real-Time Collaborative Coding & Interview Platform
## Architecture Specification (v1)

---

## 1. System Overview

The **Real-Time Collaborative Coding & Interview Platform** is a specialized, production-grade full-stack system designed to conduct live technical interviews. The platform allows interviewers and candidates to interact within a shared, low-latency collaborative coding workspace featuring in-browser code execution, strict role-based access control, participant synchronization, and post-session code persistence.

### High-Level System Goals
- **Low-Latency Collaborative Editing:** Sub-50ms peer-to-peer perceived editing latency through Conflict-Free Replicated Data Types (CRDTs).
- **Determinism and Event Consistency:** Conflict-free document convergence regardless of network delays, reordering, or temporary disconnections.
- **Reliable Isolation & Code Execution:** Secure, multi-language, untrusted code execution using a sandboxed asynchronous execution engine (Judge0).
- **Structured Interview Lifecycle:** Deterministic interview state progression: `SCHEDULED` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`.
- **Granular Session Control:** Interviewer capabilities to lock the editor (read-only enforcement), manage language configurations, and terminate the session.
- **Clean Architectural Boundaries:** Separation between persistent relational data (PostgreSQL), ephemeral real-time state (Redis), collaborative CRDT document logic (Yjs), transport (Socket.io), and client presentation (React + Monaco).

---

## 2. Component Architecture

The platform follows a modular, client-server topology centered around an event-driven Node.js/Express backend communicating with client applications via HTTP and WebSockets, backed by PostgreSQL for persistence, Redis for transient coordination, and Judge0 for code execution.

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT TIER                                       |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                             React SPA (Vite)                                |  |
|  |  +------------------------+  +-------------------+  +--------------------+  |  |
|  |  | Monaco Editor          |  | y-monaco Binding  |  | Yjs Document       |  |  |
|  |  | (Syntax/Cursor/Decor.) |<---> (Editor Adapter)|<---> (CRDT Y.Text)    |  |  |
|  |  +------------------------+  +-------------------+  +---------+----------+  |  |
|  |              ^                                                |             |  |
|  |              | UI State / Permissions                         | Updates     |  |
|  |  +-----------+------------+                         +---------v----------+  |  |
|  |  | Interview Workspace    |<------------------------| Socket.io Client   |  |  |
|  |  | UI Controls & Panels   |        Events           | (WebSocket Engine) |  |  |
|  |  +------------------------+                         +---------+----------+  |  |
|  +---------------------------------------------------------------|-------------+  |
+------------------------------------------------------------------|----------------+
                                                                   |
                          HTTPS / WSS                              |
                                                                   v
+-----------------------------------------------------------------------------------+
|                                 SERVER TIER                                       |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                      Express.js & Socket.io Gateway                         |  |
|  |                                                                             |  |
|  |  +-------------------------+            +--------------------------------+  |  |
|  |  | REST API Router         |            | Socket.io Connection Manager   |  |  |
|  |  | - Auth (JWT Login/Reg)  |            | - Room Join/Leave Lifecycle    |  |  |
|  |  | - Interview Management  |            | - Yjs Binary Message Relaying  |  |  |
|  |  | - Health Checks         |            | - Server-Side Lock Enforcement |  |  |
|  |  +------------+------------+            +---------------+----------------+  |  |
|  |               |                                         |                   |  |
|  |               +--------------------+--------------------+                   |  |
|  |                                    |                                        |  |
|  |                     +--------------v--------------+                         |  |
|  |                     | Business Logic Controllers  |                         |  |
|  |                     | - Execution Controller      |                         |  |
|  |                     | - Snapshot Scheduler        |                         |  |
|  |                     +-------+--------------+------+                         |  |
|  +-----------------------------|--------------|--------------------------------+  |
+--------------------------------|--------------|-----------------------------------+
                                 |              |
                +----------------+              +-------------------+
                |                                                   |
                v                                                   v
+-------------------------------+                   +-------------------------------+
|         STATE / DATA          |                   |         EXECUTION TIER        |
|                               |                   |                               |
|  +-------------------------+  |                   |  +-------------------------+  |
|  | PostgreSQL (Relational) |  |                   |  | Judge0 Sandbox Engine   |  |
|  | - Users & Credentials   |  |                   |  | - Isolated Worker Box   |  |
|  | - Interviews & Roles    |  |                   |  | - Asynchronous Queue    |  |
|  | - Snapshots & History   |  |                   |  | - Multi-Language Runner |  |
|  | - Execution Audit Logs  |  |                   |  +-------------------------+  |
|  +-------------------------+  |                   +-------------------------------+
|                               |
|  +-------------------------+  |
|  | Redis (Ephemeral / Cache)| |
|  | - Room Presence Tracker |  |
|  | - Editor Lock Holder    |  |
|  | - Ephemeral Doc Cache   |  |
|  +-------------------------+  |
+-------------------------------+
```

---

## 3. Responsibilities and Boundaries

### 3.1 React (Frontend UI)
- **Responsibilities:**
  - Renders user interfaces: authentication views, interview room setup, candidate/interviewer dashboards, execution terminal/output consoles, and participant presence bars.
  - Manages client-side view state (active tab, selected language, run button loading states, modal states).
  - Listens to Socket.io events and dispatches UI updates.
- **Boundaries:**
  - React **never** directly mutates collaborative document state; all text changes flow through Monaco and Yjs.
  - React **never** enforces security checks unilaterally; frontend locks are strictly visual indications backed by server-side verification.

### 3.2 Monaco Editor (Code Editing Surface)
- **Responsibilities:**
  - Provides a high-performance in-browser code editor with syntax highlighting, indentation, folding, and autocomplete.
  - Renders remote collaborator selections, cursors, and line decorations provided by Yjs awareness.
  - Reflects read-only state when the editor lock is toggled on.
- **Boundaries:**
  - Monaco has no awareness of network protocols, WebSockets, or database entities.
  - Monaco content is purely a projection of the underlying Yjs shared text structure (`Y.Text`).

### 3.3 Yjs (Conflict-Free Replicated Data Type Engine)
- **Responsibilities:**
  - Maintains the shared document data structure (`Y.Doc`) and shared code text (`Y.Text`).
  - Resolves concurrent insertion, deletion, and formatting conflicts deterministically using Lamport timestamps and unique client IDs without central locking.
  - Generates compact, binary-encoded incremental updates (`Uint8Array`) upon local changes.
  - Integrates with Monaco via `y-monaco` to translate Monaco selection/cursor events into Yjs awareness states.
- **Boundaries:**
  - Yjs is network-agnostic; it does not know or care how binary update buffers travel across the wire.
  - Yjs does not communicate with databases or disk storage directly.

### 3.4 Socket.io (Real-Time Communication Transport)
- **Responsibilities:**
  - Provides bidirectional, low-latency, event-driven WebSocket communication with automatic HTTP long-polling fallback.
  - Manages room-based multiplexing (`interview:{interviewId}`).
  - Transports Yjs binary updates (`sync-step-1`, `sync-step-2`, `sync-update`) between clients and the server.
  - Emits real-time control events: `lock_status_changed`, `execution_started`, `execution_completed`, `user_joined`, `user_left`.
- **Boundaries:**
  - Socket.io is a transport mechanism; it does not parse, modify, or merge Yjs CRDT payload internals.
  - Socket.io does not validate business logic or manage database transactions directly.

### 3.5 Express.js (Application Server & API Gateway)
- **Responsibilities:**
  - Serves RESTful endpoints for user authentication, interview scheduling, participant invites, and health checks.
  - Hosts and coordinates the Socket.io server instance.
  - Authenticates WebSocket connections using JWT tokens passed during connection handshakes.
  - Enforces authorization rules (e.g., verifying that only an `INTERVIEWER` can lock the editor or terminate an interview).
  - Orchestrates snapshot persistence to PostgreSQL and temporary lock storage in Redis.
  - Acts as an authenticated reverse proxy/client to the Judge0 execution API.
- **Boundaries:**
  - Express remains stateless where possible; all shared real-time operational state is stored in Redis or database tables.
  - Express does not compile or run untrusted user code in its own runtime process.

### 3.6 PostgreSQL (Persistent Source of Truth)
- **Responsibilities:**
  - Stores all long-term relational data requiring ACID compliance:
    - User accounts, password hashes, email addresses, roles.
    - Interview sessions (metadata, scheduled time, actual start/end timestamps, final status).
    - Session participants (user ID, interview ID, assigned role).
    - Periodic code snapshots (interview ID, snapshot timestamp, full code content, language, trigger type).
    - Code execution records (submission token, stdout, stderr, exit code, execution time, memory used).
- **Boundaries:**
  - PostgreSQL does not track keystroke-level changes or high-frequency ephemeral state (e.g., cursor positions, current typing status).
  - PostgreSQL is accessed exclusively through backend connection pools, never directly by clients.

### 3.7 Redis (Ephemeral In-Memory State & Coordination)
- **Responsibilities:**
  - High-performance, sub-millisecond in-memory cache and key-value store for transient interview data:
    - Active interview room membership: active socket IDs and user presence sets (`room:{id}:users`).
    - Editor lock state (`room:{id}:lock` -> `{ locked: boolean, lockedBy: userId, lockedAt: timestamp }`).
    - Ephemeral Yjs document update buffer / latest serialized document cache to accelerate late-joiner synchronization.
    - Rate-limiting counters for API endpoints and code run triggers.
    - TTL-governed session tokens and temporary heartbeat tracking.
- **Boundaries:**
  - Redis is treated as an ephemeral store; if Redis restarts, the platform can reconstitute session state from PostgreSQL snapshots.
  - Redis does not store permanent historical audit records or finalized interview data.

### 3.8 Judge0 (Sandboxed Remote Code Execution Engine)
- **Responsibilities:**
  - Securely executes untrusted user-submitted code in an isolated container/sandbox environment.
  - Supports multiple programming languages (JavaScript, Python, Java, C++, Go, etc.).
  - Enforces strict execution limits: CPU time limits (e.g., 5 seconds), wall clock limits, memory limits (e.g., 128MB), stack limits, and process limits.
  - Disables networking inside the execution sandbox to prevent SSRF, malware download, or outbound scanning.
  - Returns structured execution outcomes: `stdout`, `stderr`, `compile_output`, `status` (Accepted, Wrong Answer, Time Limit Exceeded, Runtime Error).
- **Boundaries:**
  - Judge0 has no knowledge of interview concepts, users, or WebSocket rooms.
  - Judge0 only communicates with the Express backend over HTTP REST calls; it is never directly exposed to the public internet or frontend clients.

---

## 4. Source-of-Truth Definitions

To eliminate race conditions and state divergence, data ownership is rigorously defined:

| Data Category | Component | Storage Mechanism | Durability | Access Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **User Identity & Credentials** | PostgreSQL | `users` table | Permanent | Read on login, cached in JWT |
| **Interview Metadata & Status** | PostgreSQL | `interviews` table | Permanent | Read on join, updated on status change |
| **Collaborative Code Text (Live)** | Yjs Engine / Redis Buffer | In-memory `Y.Doc` & Redis key | Ephemeral (Session) | Mutated via CRDT updates, synced per keystroke |
| **Historical Code Checkpoints** | PostgreSQL | `interview_snapshots` table | Permanent | Append-only on autosave timer / execution / end |
| **Editor Lock State** | Redis | `room:{id}:lock` | Ephemeral (Session) | Atomic read/write by Express backend |
| **Active Participants / Presence** | Redis | `room:{id}:participants` | Ephemeral (TTL) | Updated on socket join/leave/heartbeat |
| **Code Execution Output** | PostgreSQL (audit) / Redis (temp) | `code_executions` table | Permanent (Audit) | Written by Express after Judge0 poll completes |

---

## 5. Authentication Flow

Authentication is built on industry-standard stateless JSON Web Tokens (JWT) with HTTP-only cookies or bearer authorization headers.

```
Candidate / Interviewer                  Express API Server                 PostgreSQL
       |                                         |                              |
       |--- 1. POST /api/auth/login ------------>|                              |
       |    { email, password }                  |--- 2. Query user & hash ---->|
       |                                         |<-- 3. Return user record ----|
       |                                         |                              |
       |                                         |-- 4. Verify bcrypt hash      |
       |                                         |-- 5. Sign JWT with role      |
       |<-- 6. 200 OK + JWT Token ---------------|                              |
       |                                         |                              |
       |=== Socket.io Handshake =================|                              |
       |--- 7. ws://connect (auth: { token }) -->|                              |
       |                                         |-- 8. Verify JWT signature    |
       |                                         |-- 9. Extract userId & role   |
       |<-- 10. Connection Accepted -------------|                              |
```

1. **Client Submission:** Client submits credentials (`email`, `password`) over HTTPS to `/api/auth/login`.
2. **Credential Verification:** Express queries PostgreSQL for the user record, verifies password with `bcrypt`.
3. **Token Generation:** Express signs a JWT payload containing `userId`, `email`, and system `role` (`CANDIDATE` or `INTERVIEWER`), with an expiration timestamp.
4. **WebSocket Authentication:** When connecting to the Socket.io server, the client sends the JWT in the handshake `auth` payload. The server validates the token in middleware before permitting the connection.

---

## 6. Interview Creation & Joining Flow

```
Interviewer (Host)            Express API Server           PostgreSQL            Redis
     |                                |                        |                   |
     |-- 1. POST /api/interviews ---->|                        |                   |
     |   { title, candidateEmail }    |-- 2. INSERT interview->|                   |
     |                                |<-- 3. Return id, token-|                   |
     |<-- 4. 201 Created (Room URL) --|                        |                   |
     |                                |                        |                   |
Candidate (Guest)                     |                        |                   |
     |-- 5. GET /api/interviews/:id ->|                        |                   |
     |                                |-- 6. Check access ---->|                   |
     |<-- 7. 200 OK (Session details)-|                        |                   |
     |                                |                        |                   |
Both Clients                          |                        |                   |
     |-- 8. Socket: join_room ------->|                        |                   |
     |   { interviewId }              |-- 9. Validate status ->|                   |
     |                                |-- 10. Add to set ------------------------->|
     |                                |-- 11. Broadcast user_joined to room ------>|
     |<-- 12. Emit initial_room_state-|                        |                   |
```

1. **Creation:** An authenticated interviewer creates an interview room via `POST /api/interviews`. Express generates a unique UUID `interviewId` and stores it in PostgreSQL with status `SCHEDULED`.
2. **Access Control:** The candidate receives an invite link with the room ID. Upon visiting, the client queries `GET /api/interviews/:id` to check authorization and interview status.
3. **Room Admission:** Both participants establish Socket.io connections and emit `join_room` with `interviewId`.
4. **State Initialization:** Express adds the client to the Socket.io room, registers the user in the Redis active presence set, transitions interview status to `IN_PROGRESS` if not already started, and responds with the current room state (active language, lock status, active participants).

---

## 7. Collaborative Editing Flow

Collaborative code editing utilizes Yjs as an in-memory CRDT on both clients, connected over a server-relayed Socket.io channel.

```
Client A (Editor)                 Express / Socket.io               Client B (Peer)
       |                                   |                                |
       |-- 1. Keystroke in Monaco          |                                |
       |-- 2. y-monaco updates Y.Text      |                                |
       |-- 3. Yjs triggers 'update' event  |                                |
       |-- 4. Emit 'sync_update' (binary)->|                                |
       |                                   |-- 5. Verify room lock status   |
       |                                   |-- 6. Buffer in Redis cache     |
       |                                   |-- 7. Broadcast 'sync_update' ->|
       |                                   |                                |-- 8. Apply update to Y.Doc
       |                                   |                                |-- 9. y-monaco updates Monaco
       |                                   |                                |-- 10. Remote cursor updated
```

1. **Local Mutation:** User A types in Monaco. The `y-monaco` binding intercepts the change and applies an atomic operation to the local `Y.Text` instance.
2. **Update Generation:** Yjs encodes the delta into a compact binary buffer (`Uint8Array`) containing Lamport timestamps and client identity.
3. **Relay via Express:** The client emits `sync_update` with the binary payload over Socket.io. Express checks if User A has write permissions (i.e. room is not locked against User A), saves the update to an ephemeral document buffer in Redis, and broadcasts `sync_update` to all other sockets in `interview:{interviewId}`.
4. **Remote Convergence:** User B receives `sync_update`, applies it to its local `Y.Doc`. Yjs merges changes deterministically. `y-monaco` reflects the update inside User B's Monaco editor without jumping or cursor disruption.

---

## 8. Yjs Late-Joiner Synchronization

When a user joins late or reconnects after network drop, the state vector protocol ensures rapid convergence:

```
Reconnecting Client                      Express Server                   Redis / Active Peer
       |                                        |                                  |
       |-- 1. join_room (with interviewId) ---->|                                  |
       |-- 2. Emit 'sync_step_1' -------------->|                                  |
       |   (Payload: local State Vector)        |                                  |
       |                                        |-- 3. Fetch latest Doc / Vector ->|
       |                                        |<-- 4. Return cached binary state-|
       |                                        |                                  |
       |                                        |-- 5. Compute missing diff        |
       |<-- 6. Emit 'sync_step_2' (State Diff) -|                                  |
       |                                        |                                  |
       |-- 7. Apply diff to local Y.Doc         |                                  |
       |-- 8. Document fully synchronized       |                                  |
```

1. **Sync Step 1:** The reconnecting client computes its local state vector (a compact summary of all update versions it already holds) and emits `sync_step_1(stateVector)`.
2. **Server/Peer Diff Calculation:** The server (or a designated room peer) compares the state vector against the current document state and generates `sync_step_2`, containing exclusively the missing updates.
3. **Convergence:** The reconnecting client applies `sync_step_2`. At this point, both documents are identical. Any new incoming `sync_update` messages are processed normally.

---

## 9. Snapshot-Based Persistence

To maintain durability without overwhelming PostgreSQL with individual keystrokes, the system uses a **snapshot-based persistence model**.

### Snapshot Triggers
1. **Periodic Autosave:** Every 30 seconds (configurable), if the document has been modified since the last snapshot, Express serializes the current code text and writes a snapshot to PostgreSQL.
2. **Execution Trigger:** Immediately prior to dispatching code to Judge0, a snapshot is saved.
3. **Editor Lock Trigger:** When an interviewer toggles the editor lock, a snapshot is recorded.
4. **Session Termination Trigger:** When the interview ends, a final authoritative snapshot is written.

### Persistence Schema Concept
- `interview_snapshots`:
  - `id`: UUID (Primary Key)
  - `interview_id`: UUID (Foreign Key -> `interviews.id`)
  - `snapshot_content`: `TEXT` (full source code text)
  - `language`: `VARCHAR(32)`
  - `trigger_type`: `VARCHAR(32)` (`AUTOSAVE`, `MANUAL_RUN`, `LOCK_TOGGLE`, `TERMINATION`)
  - `created_at`: `TIMESTAMP WITH TIME ZONE`

---

## 10. Editor Locking & Backend Enforcement

The editor lock enables interviewers to restrict candidate typing (e.g., during problem explanation, review, or code evaluation).

```
Interviewer                       Express Server                     Redis             Candidate
     |                                   |                             |                   |
     |-- 1. Emit 'toggle_lock' --------->|                             |                   |
     |   { interviewId, locked: true }   |-- 2. Verify role == HOST    |                   |
     |                                   |-- 3. Set room lock state -->|                   |
     |                                   |-- 4. Broadcast 'lock_changed' ----------------->|
     |<-- 5. Ack lock enabled -----------|      { locked: true, by }   |                   |-- 6. Monaco set to
     |                                   |                             |                      readOnly: true
     |                                   |                             |                   |
     |                                   |<-- 7. Malicious/Late Keystroke (sync_update) ---|
     |                                   |-- 8. Query lock state ----->|                   |
     |                                   |   (Result: Locked for user) |                   |
     |                                   |-- 9. DROP UPDATE SILENTLY   |                   |
     |                                   |   (No broadcast to peers)   |                   |
```

- **Frontend Behavior:** When `lock_changed` is received with `locked: true`, Monaco's `readOnly` option is set to `true`. Visual indicators (lock banner, disabled cursor) inform the candidate.
- **Backend Enforcement:** The Express server checks the Redis lock key before relaying any `sync_update` from a candidate. If the room is locked and the sender is a candidate, the update is dropped immediately, preventing bypass via browser developer tools.

---

## 11. Asynchronous Judge0 Execution

Untrusted user code is executed remotely through the Judge0 REST API asynchronously to avoid blocking the Express event loop.

```
Client (User)                  Express Server                Judge0 API             Worker Sandbox
      |                              |                           |                        |
      |-- 1. POST /api/run-code ---->|                           |                        |
      |   { language_id, source }    |-- 2. Save snapshot        |                        |
      |                              |-- 3. POST /submissions -->|                        |
      |                              |   (async mode: true)      |-- 4. Queue task ------>|
      |                              |<-- 5. Return token -------|                        |
      |<-- 6. 202 Accepted (token) --|                           |                        |
      |                              |                           |                        |
      |                              |=== Polling Loop (every 500ms, max 10s) ===         |
      |                              |-- 7. GET /submissions/:tok|                        |
      |                              |<-- 8. Status: Processing -|                        |
      |                              |                           |<-- 9. Finished --------|
      |                              |-- 10. GET /submissions/:tk|                        |
      |                              |<-- 11. Status: Completed -|                        |
      |                              |    { stdout, stderr, time}|                        |
      |                              |                           |                        |
      |                              |-- 12. Save to execution audit log (PostgreSQL)     |
      |                              |-- 13. Broadcast 'execution_result' via Socket.io ->|
      |<-- 14. Terminal renders stdout / stderr / execution metrics ----------------------|
```

### Execution Parameters & Safeguards
- **CPU Time Limit:** 5.0 seconds maximum.
- **Wall Time Limit:** 10.0 seconds maximum.
- **Memory Limit:** 128 MB maximum.
- **Network Access:** Disabled in sandbox.
- **Rate Limiting:** Maximum 1 execution every 5 seconds per room enforced via Redis token bucket.

---

## 12. Interview Termination

When an interview concludes, the system ensures graceful cleanup and state finalization:

1. **Initiation:** The interviewer calls `POST /api/interviews/:id/end` or emits `end_interview`.
2. **Authorization Check:** Server validates that the requester has the `INTERVIEWER` role.
3. **Final Snapshot:** Server requests the latest text from the active Yjs document and executes a synchronous write to `interview_snapshots` with `trigger_type = 'TERMINATION'`.
4. **Status Update:** The interview row in PostgreSQL is updated to `status = 'COMPLETED'` with `ended_at = NOW()`.
5. **Notification:** Express emits `interview_ended` to all connected clients in the room.
6. **Client Transition:** Clients transition Monaco to permanent read-only mode and display the completion summary.
7. **Resource Teardown:** Ephemeral Redis keys for room presence and locks are deleted. Sockets leave the room and are disconnected gracefully.

---

## 13. Security Boundaries

```
+-------------------------------------------------------------------------------+
| UNTRUSTED EXTERNAL ZONE                                                       |
| - Public Internet / Web Browsers                                              |
| - Attack Vectors: XSS, Keystroke spoofing, Token theft, DOS                   |
+---------------------------------------+---------------------------------------+
                                        | HTTPS / WSS Only
                                        v
+---------------------------------------+---------------------------------------+
| DMZ / INGRESS BOUNDARY                                                        |
| - CORS Whitelisting                                                           |
| - Helmet HTTP Security Headers                                                |
| - Express Rate Limiting (100 req/min per IP)                                  |
| - JWT Signature & Expiration Verification                                     |
+---------------------------------------+---------------------------------------+
                                        | Authenticated Context
                                        v
+---------------------------------------+---------------------------------------+
| APPLICATION CORE                                                              |
| - Role-Based Access Control (RBAC): Candidate vs. Interviewer                 |
| - Server-Side Editor Lock Enforcement (Discards unauthorized Yjs frames)     |
| - Parameterized SQL Queries (pg Pool) preventing SQL Injection                |
+-------------------+-----------------------------------+-----------------------+
                    |                                   |
                    v                                   v
+-------------------+-------------------+   +-----------+---------------------------+
| INTERNAL STORAGE                      |   | EXECUTION ISOLATION BOUNDARY          |
| - PostgreSQL: Network isolated        |   | - Judge0 REST API: Internal network   |
| - Redis: Password protected, internal |   | - Linux cgroups, seccomp, ptrace      |
| - Credentials passed via .env only    |   | - Zero network egress inside sandbox  |
+---------------------------------------+   +---------------------------------------+
```

- **Authentication Tokens:** Signed with strong asymmetric or HMAC keys, validated on every REST and WebSocket request.
- **SQL Injection Prevention:** 100% parameterized queries via `pg` library; no raw string concatenation.
- **Code Execution Sandboxing:** Untrusted code runs exclusively inside isolated Judge0 sandbox containers with CPU, memory, process, and network barriers.
- **No Secrets in Source:** All database URLs, Redis connection strings, JWT secrets, and API keys are loaded via environment variables; `.gitignore` strictly protects `.env`.

---

## 14. Scalability and Failure Handling

### 14.1 Network Disconnect & Reconnect
- Socket.io automatically attempts exponential backoff reconnection.
- Upon reconnection, the client automatically triggers the Yjs `sync_step_1` handshake to reconcile any missed updates without losing locally drafted changes.

### 14.2 Redis Outage Resiliency
- If Redis becomes unavailable, the Express backend falls back to in-memory room tracking and issues a warning log.
- Persistent session state is unaffected because PostgreSQL retains all authoritative data.

### 14.3 Database Connection Management
- Uses a managed `pg.Pool` connection pool with min/max bounds and timeout limits to prevent connection exhaustion under burst loads.

### 14.4 Unresponsive Code Execution
- A hard 10-second timeout is enforced on Judge0 polling. If Judge0 fails to respond or reports an execution timeout, Express cancels the pending request, notifies the room with a timeout error, and unlocks the run button.

---

## 15. Major Architectural Decisions

1. **Centralized Relay over P2P:** Chose client-server WebSockets (Socket.io) over peer-to-peer WebRTC data channels to guarantee centralized authorization, backend lock enforcement, and reliable server-side persistence.
2. **Yjs CRDT over Operational Transformation (OT):** Selected Yjs because it does not require an active central transformation server to sequence keystrokes, provides native Monaco bindings, and handles intermittent disconnections gracefully.
3. **Relational PostgreSQL for System of Record:** Chosen for rigorous transactional integrity, referential constraints across users, interviews, and snapshots, and standardized SQL reporting.
4. **Redis for Ephemeral Coordination:** Separated ephemeral high-frequency states (presence, lock flags, transient buffers) from PostgreSQL to avoid database write bloat and minimize locking contention.
5. **Third-Party Sandboxed Execution (Judge0):** Decoupled execution from the application server runtime to eliminate security risks of executing untrusted code directly on host servers.

---

## 16. Architectural Decision Records (ADRs)

### ADR-001: Adoption of Yjs CRDT for Real-Time Collaboration
- **Status:** Accepted
- **Context:** Real-time collaborative code editing requires conflict resolution when multiple users type concurrently.
- **Decision:** Use Yjs with `y-monaco` binding.
- **Consequences:** Eliminates central transformation bottleneck, provides predictable convergence, and supports offline/reconnection syncing seamlessly.

### ADR-002: Socket.io for Real-Time Transport
- **Status:** Accepted
- **Context:** Need reliable bidirectional communication between clients and Express for Yjs updates and room control events.
- **Decision:** Use Socket.io with room abstraction.
- **Consequences:** Provides built-in reconnection, room broadcasting, and binary buffer transport out of the box.

### ADR-003: Redis for Ephemeral State & Lock Coordination
- **Status:** Accepted
- **Context:** Tracking room participant presence and editor lock state needs sub-millisecond access and auto-expiry capabilities.
- **Decision:** Use Redis key-value store with TTLs.
- **Consequences:** Fast access, zero persistent DB overhead for transient events, lightweight lock checks before relaying updates.

### ADR-004: PostgreSQL as Persistent Source of Truth
- **Status:** Accepted
- **Context:** Requires persistent, transactional storage for users, interview records, code snapshots, and execution logs.
- **Decision:** Use PostgreSQL with connection pooling.
- **Consequences:** High reliability, relational integrity, easy point-in-time recovery via snapshots.

### ADR-005: Sandboxed Code Execution via Judge0
- **Status:** Accepted
- **Context:** Executing arbitrary candidate code in languages like Python, C++, and Java poses security risks.
- **Decision:** Delegate execution to Judge0 via asynchronous HTTP submission and polling.
- **Consequences:** Isolates execution risks from core API servers; limits CPU, RAM, and network capabilities of user code.

### ADR-006: Monorepo Structure with npm Workspaces
- **Status:** Accepted
- **Context:** Frontend and backend need to share types/configurations while maintaining clean package separation.
- **Decision:** Adopt an npm workspace monorepo (`frontend/`, `backend/`).
- **Consequences:** Unified dependency installation (`npm ci`), simplified scripts, and single-repository CI workflows.

---

## 17. Implementation Dependency Graph

The project implementation progresses strictly across distinct sequential phases where each phase builds upon validated foundations:

```
[Phase 0: Project Foundation]  <--- COMPLETED & ACCEPTED
      |
      v
[Phase 1: Authentication & Database Models]
      | - PostgreSQL schema migrations (users, interviews, participants)
      | - JWT authentication, registration, login endpoints
      | - Password hashing (bcrypt) & auth middleware
      v
[Phase 2: Real-Time Collaborative Workspace]
      | - Socket.io room orchestration
      | - Monaco Editor integration in React
      | - Yjs + y-monaco CRDT synchronization
      | - Redis presence tracking
      v
[Phase 3: Code Execution Engine Integration]
      | - Judge0 REST API integration
      | - Multi-language execution submission & polling
      | - Terminal / execution console in React UI
      | - Execution audit logging in PostgreSQL
      v
[Phase 4: Interview Lifecycle & Editor Control]
      | - Interviewer editor locking (Redis + backend enforcement)
      | - Snapshot-based persistence engine (periodic + event-driven)
      | - Interview conclusion workflow & finalization
      v
[Phase 5: UI Polish, Resilience & Production Hardening]
      | - Comprehensive error handling & reconnection banners
      | - Performance optimization & asset bundling
      | - Security hardening & end-to-end verification
```
