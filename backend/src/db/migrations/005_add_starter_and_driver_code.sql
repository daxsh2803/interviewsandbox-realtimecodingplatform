-- 005_add_starter_and_driver_code.sql

ALTER TABLE problems
ADD COLUMN IF NOT EXISTS starter_code JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS driver_code JSONB DEFAULT '{}'::jsonb;
