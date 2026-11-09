-- Migration: add is_correction / correction_reason columns to sensor_line_readings
-- These columns mark synthetic correction rows inserted by the midnight
-- reset job so they can be filtered out of raw exports / audited separately.
ALTER TABLE sensor_line_readings
    ADD COLUMN IF NOT EXISTS is_correction    BOOLEAN   NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS correction_reason VARCHAR(255);
