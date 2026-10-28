BEGIN;

CREATE TABLE IF NOT EXISTS sensor_ingest_credentials (
    id BIGSERIAL PRIMARY KEY,
    sensor_id INTEGER NOT NULL
        REFERENCES sensors(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_sensor_ingest_credential_token_hash UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS ix_sensor_ingest_credentials_sensor_id
    ON sensor_ingest_credentials (sensor_id);

COMMIT;
