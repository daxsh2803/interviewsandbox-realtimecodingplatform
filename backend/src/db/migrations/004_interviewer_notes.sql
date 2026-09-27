-- 004_interviewer_notes.sql

CREATE TABLE interviewer_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE NOT NULL,
    interviewer_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    notes TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(interview_id, interviewer_id)
);

CREATE INDEX idx_interviewer_notes_interview_id ON interviewer_notes(interview_id);
