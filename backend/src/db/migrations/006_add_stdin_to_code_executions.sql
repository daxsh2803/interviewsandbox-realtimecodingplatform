-- 006_add_stdin_to_code_executions.sql

ALTER TABLE code_executions
ADD COLUMN IF NOT EXISTS stdin TEXT;
