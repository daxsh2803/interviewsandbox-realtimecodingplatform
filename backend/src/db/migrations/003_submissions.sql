-- 003_submissions.sql

CREATE TABLE test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE NOT NULL,
    input TEXT NOT NULL,
    expected_output TEXT NOT NULL,
    is_hidden BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_test_cases_problem_id ON test_cases(problem_id);

CREATE TABLE submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    problem_id UUID REFERENCES problems(id) ON DELETE CASCADE NOT NULL,
    language VARCHAR(50) NOT NULL,
    source_code TEXT NOT NULL,
    status VARCHAR(50) CHECK (status IN ('Processing', 'Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compilation Error', 'Internal Error')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_interview_id ON submissions(interview_id);
CREATE INDEX idx_submissions_problem_id ON submissions(problem_id);

CREATE TABLE submission_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE NOT NULL,
    test_case_id UUID REFERENCES test_cases(id) ON DELETE CASCADE NOT NULL,
    status VARCHAR(50) DEFAULT 'Processing' CHECK (status IN ('Processing', 'Accepted', 'Wrong Answer', 'Time Limit Exceeded', 'Runtime Error', 'Compilation Error', 'Internal Error')),
    stdout TEXT,
    stderr TEXT,
    execution_time_ms INTEGER,
    memory_bytes INTEGER,
    judge0_token VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submission_results_submission_id ON submission_results(submission_id);
CREATE INDEX idx_submission_results_judge0_token ON submission_results(judge0_token);
