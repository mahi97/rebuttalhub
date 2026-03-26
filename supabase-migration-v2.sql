-- Migration v2: Add template, guidelines, labels, and thank_you_note

-- Add rebuttal template and guidelines to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS rebuttal_template TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS guidelines TEXT;

-- Add label column to review_points (e.g., "W1", "Q2", "L1", "Thank You")
ALTER TABLE review_points ADD COLUMN IF NOT EXISTS label TEXT DEFAULT '';

-- Add thank_you_note to reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS thank_you_note TEXT;

-- Update section check constraint to include new types
ALTER TABLE review_points DROP CONSTRAINT IF EXISTS review_points_section_check;
-- No constraint needed since section is just TEXT
