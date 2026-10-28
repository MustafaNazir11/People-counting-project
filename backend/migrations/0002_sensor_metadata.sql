BEGIN;

ALTER TABLE sensors
    ADD COLUMN IF NOT EXISTS milesight_device_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS model VARCHAR(50),
    ADD COLUMN IF NOT EXISTS firmware_version VARCHAR(100),
    ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45),
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS config_synced_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'sensors'::regclass
          AND contype = 'u'
          AND pg_get_constraintdef(oid) = 'UNIQUE (milesight_device_id)'
    ) THEN
        ALTER TABLE sensors
            ADD CONSTRAINT uq_sensors_milesight_device_id
            UNIQUE (milesight_device_id);
    END IF;
END
$$;

COMMIT;
