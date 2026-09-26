-- 002_add_judge0_token.sql

ALTER TABLE code_executions
ADD COLUMN judge0_token VARCHAR(255);

-- Index for quick lookups by webhook/callback
CREATE INDEX idx_code_executions_judge0_token ON code_executions(judge0_token);
