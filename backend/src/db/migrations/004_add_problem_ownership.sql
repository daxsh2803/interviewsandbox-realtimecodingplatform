-- 004_add_problem_ownership.sql

ALTER TABLE problems 
ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
