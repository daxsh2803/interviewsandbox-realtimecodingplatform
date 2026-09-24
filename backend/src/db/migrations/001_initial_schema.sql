-- 001_initial_schema.sql

-- Enable pgcrypto for gen_random_uuid() if not already available natively
-- In PostgreSQL 13+, gen_random_uuid() is built-in.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Problems Table
CREATE TABLE problems (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    difficulty VARCHAR(50) CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Interviews Table
CREATE TABLE interviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    scheduled_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Interview Participants Table (Junction Table)
CREATE TABLE interview_participants (
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL CHECK (role IN ('INTERVIEWER', 'CANDIDATE')),
    joined_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (interview_id, user_id)
);

-- 5. Interview Problems Table (Junction Table)
CREATE TABLE interview_problems (
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE,
    PRIMARY KEY (interview_id, problem_id)
);

-- 6. Code Snapshots Table
CREATE TABLE interview_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
    snapshot_content TEXT NOT NULL,
    language VARCHAR(50) NOT NULL,
    trigger_type VARCHAR(50) NOT NULL CHECK (trigger_type IN ('AUTOSAVE', 'MANUAL_RUN', 'LOCK_TOGGLE', 'TERMINATION')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fetching snapshots by interview quickly
CREATE INDEX idx_interview_snapshots_interview_id ON interview_snapshots(interview_id);

-- 7. Submissions / Code Executions Table
CREATE TABLE code_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    problem_id UUID REFERENCES problems(id) ON DELETE SET NULL,
    language VARCHAR(50) NOT NULL,
    source_code TEXT NOT NULL,
    status VARCHAR(50) CHECK (status IN ('Processing', 'Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compilation Error', 'Internal Error')),
    stdout TEXT,
    stderr TEXT,
    execution_time_ms INTEGER,
    memory_bytes INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fetching executions by interview quickly
CREATE INDEX idx_code_executions_interview_id ON code_executions(interview_id);
