BEGIN;

ALTER TABLE sensor_line_readings
    ADD COLUMN IF NOT EXISTS source_event_id VARCHAR(255);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM sensor_line_readings
        WHERE source_event_id IS NOT NULL
          AND btrim(source_event_id) = ''
    ) THEN
        RAISE EXCEPTION
            'sensor_line_readings contains empty source_event_id values';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM sensor_line_readings
        WHERE source_event_id IS NOT NULL
        GROUP BY sensor_id, source_event_id, line_uuid
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'sensor_line_readings has duplicate sensor/event/line identities';
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_sensor_reading_source_event_line'
          AND conrelid = 'sensor_line_readings'::regclass
    ) THEN
        ALTER TABLE sensor_line_readings
            ADD CONSTRAINT uq_sensor_reading_source_event_line
            UNIQUE (sensor_id, source_event_id, line_uuid);
    END IF;
END
$$;

COMMIT;
