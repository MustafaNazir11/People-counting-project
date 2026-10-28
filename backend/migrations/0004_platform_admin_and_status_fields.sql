-- Migration 0004: platform admins and entity status fields
-- Adds columns with safe defaults so existing records are preserved.
-- Does not delete application data.

BEGIN;

CREATE TABLE IF NOT EXISTS platform_admins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE stores
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS device_id VARCHAR(100);

-- Give existing sensors a placeholder until their real device IDs are known.
UPDATE sensors
SET device_id = 'legacy-sensor-' || id::text
WHERE device_id IS NULL OR btrim(device_id) = '';

ALTER TABLE sensors
    ALTER COLUMN device_id SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sensors
        GROUP BY device_id
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Duplicate sensors.device_id values exist; resolve them before applying migration 0004';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sensors_device_id
    ON sensors (device_id);

COMMIT;
