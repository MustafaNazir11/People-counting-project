# VS125 integration setup

## Current repository contract evidence

The existing Milesight client documents one cloud operation: a bearer-token
`GET` of `/device/openapi/v1/devices/{device_id}/config`, returning an object
with `status: "Success"` and `data.values` as a list of `{key, value}` items.
The client keeps sensitive configuration values out of its normalized result.

The repository does not contain an authoritative Milesight device-information
or line-history endpoint, nor examples of their response shapes. Those paths
and payload contracts are therefore not guessed by this implementation. The
client methods can call configured paths, but these operations must be
confirmed against the applicable Milesight API/version before use.

The mounted `GET /sensors/milesight/config?sensor_id=...` endpoint fetches
device configuration. The mounted Milesight history routes currently return
HTTP 501. A refresh-and-store service helper exists, but it is not exposed as
an active API or scheduled job, and its configured device-information/readings
paths and response shapes have not been verified. Do not treat cloud reading
history synchronization as operational until official documentation or a
captured, authorized device response confirms the contract.

The accepted VS125 ingest body is the project’s existing local contract:
`line_periodic_total_data` containing up to four line entries, with `line`,
`line_name`, `line_uuid`, `in`, `out`, `male_in`, `male_out`, `female_in`,
`female_out`, `group_in`, and `group_out`. This is not represented as a
verified cloud response contract. It contains no source timestamp; until the
VS125 payload contract confirms one, the ingest service records server receipt
time in both existing timestamp columns.

## Active ingestion contract

The mounted endpoint is `POST /sensors/vs125/ingest`. It requires:

- `X-Sensor-Token`: a sensor-specific high-entropy token.
- `Idempotency-Key`: a stable identifier for this source event.
- The existing `line_periodic_total_data` JSON object described above.

The request does not accept a sensor ID. The backend hashes the token and
resolves it to the registered sensor through `sensor_ingest_credentials`;
readings are written for that sensor only. The database stores token hashes,
not the bearer tokens. Missing or unknown tokens receive HTTP 401. A missing
credential table or unavailable database receives HTTP 503.

Create or rotate a sensor token from the repository root:

```powershell
python backend\manage_sensor_ingest_credentials.py rotate --sensor-id 123
```

The new token is printed once. Deliver it directly to the trusted ingestion
gateway using the deployment's secret-management channel. Do not put it in
source control, command history, request logs, or the database. Rotation
revokes prior tokens for that sensor and creates a replacement in one
transaction. Revoke active tokens without replacement, or revoke one token:

```powershell
python backend\manage_sensor_ingest_credentials.py revoke --sensor-id 123
python backend\manage_sensor_ingest_credentials.py revoke --sensor-id 123 --credential-id 456
```

The physical VS125's ability to send distinct webhook credentials is not
verified by repository evidence or the vendor contract currently available.
Use a trusted gateway as the security boundary unless the hardware's supported
authentication options are confirmed. The gateway must bind its authenticated
device/source to the corresponding sensor credential; it must not forward a
client-selected sensor ID as authority.

The previous shared `SENSOR_INGEST_TOKEN` / `VS125_INGEST_TOKEN` path is no
longer accepted by the mounted endpoint. The old `/vs125/webhook` handler is
not mounted in `app.main` and must not be enabled; it uses a single
environment token and a global sensor mapping.

## Idempotency contract

PostgreSQL enforces uniqueness on
`(sensor_id, source_event_id, line_uuid)`. The ingestion endpoint stores the
provided `Idempotency-Key` as `source_event_id` and uses
`ON CONFLICT DO NOTHING`; `records_saved` counts rows actually inserted.
Different event identifiers remain insertable, while a retry with the same
event identifier and line UUID is ignored.

The repository does not establish that a physical VS125 payload contains a
stable event identifier. Do not manufacture one from receipt time. The
gateway must pass the real event identifier when confirmed, or provide a
stable idempotency key only if it can reliably reuse that key for retries of
the same logical event. Without that property, retries using new keys cannot
be recognized as duplicates; the database guarantee is conditional on a
stable per-event key and is not an exactly-once delivery guarantee.

## Environment configuration

For local development set these values in `backend/.env`. In hosted
environments, set them as deployment secrets/environment variables; process
environment values take precedence over a local `.env` file.

| Variable | Required | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | Yes | SQLAlchemy async PostgreSQL URL (`postgresql+asyncpg://...`) |
| `CORS_ALLOWED_ORIGINS` | Production | Comma-separated exact frontend origins, e.g. `https://dashboard.example.com`; defaults to local Vite origin |
| `MILESIGHT_BASE_URL` | Yes | Regional OpenAPI base URL |
| `MILESIGHT_ACCESS_TOKEN` | Yes | Bearer token; never log or expose it |
| `MILESIGHT_DEVICE_ID` | For default device | Device ID fallback |
| `MILESIGHT_DEVICE_CONFIG_PATH` | No | Config route template; defaults to the existing repository path |
| `MILESIGHT_DEVICE_INFO_PATH` | Before device-info fetch | Confirmed device-info path template, with `{device_id}` placeholder when needed |
| `MILESIGHT_READINGS_PATH` | Before cloud-reading fetch | Confirmed readings path template, with `{device_id}` placeholder when needed |
| `MILESIGHT_TIMEOUT_SECONDS` | No | Positive request timeout; defaults to `30` |

Use the database provider's TLS-enabled connection instructions for hosted
PostgreSQL. `DATABASE_URL` is passed to SQLAlchemy/asyncpg without custom TLS
enforcement in this application; verify TLS and network restrictions in the
chosen provider configuration. Do not expose the database to the public
internet.

Build the frontend with `VITE_API_URL` set to the HTTPS backend origin. The
backend must list that frontend origin in `CORS_ALLOWED_ORIGINS`. The frontend
defaults to localhost for local development.

`/health` is a liveness check. `/ready` performs a database `SELECT 1` and
returns HTTP 503 if PostgreSQL is unavailable. Startup also requires a working
database connection. `Base.metadata.create_all()` only creates missing tables;
it does not upgrade existing tables.

## Database migration

Existing installations must apply pending migrations in order:

1. [`migrations/0001_sensor_reading_idempotency.sql`](./migrations/0001_sensor_reading_idempotency.sql)
   adds event identity and the database uniqueness constraint. It aborts without
   deleting data if existing non-null event IDs are empty or duplicated.
2. [`migrations/0002_sensor_metadata.sql`](./migrations/0002_sensor_metadata.sql)
   adds nullable sensor metadata and a unique nullable device identifier.
   Check existing non-null device identifiers for duplicates first.
3. [`migrations/0003_sensor_ingest_credentials.sql`](./migrations/0003_sensor_ingest_credentials.sql)
   creates the hashed per-sensor credential registry.

Migration 0003 tolerates `Base.metadata.create_all()` having already created
the new table and index, but that startup helper still does not upgrade the
event-ID or metadata columns in existing tables.

Back up the database, confirm which migrations have already been applied, and
run only pending migrations. From the repository root in PowerShell, with a
provider-native PostgreSQL DSN in `PG_DSN`:

```powershell
psql "$env:PG_DSN" -v ON_ERROR_STOP=1 -f .\backend\migrations\0001_sensor_reading_idempotency.sql
psql "$env:PG_DSN" -v ON_ERROR_STOP=1 -f .\backend\migrations\0002_sensor_metadata.sql
psql "$env:PG_DSN" -v ON_ERROR_STOP=1 -f .\backend\migrations\0003_sensor_ingest_credentials.sql
```

Do not pass the SQLAlchemy `postgresql+asyncpg://` URL to `psql`; use the
provider's corresponding PostgreSQL DSN in `PG_DSN`. For rollback, stop sensor
ingestion and roll back application code while retaining these additive schema
changes. Do not drop the event ID column or metadata columns if their data may
be needed. Dropping `sensor_ingest_credentials` revokes all sensor tokens and
is only appropriate after ingestion is stopped and the table is confirmed
disposable; restore a backup for a full schema rollback.

`Base.metadata.create_all()` creates missing tables but does not add columns to
existing tables. It is not a substitute for these migrations. Back up the
database, review the scripts against the target schema, and apply them
separately using the approved database change process. Neither migration is
applied by this test run. Before applying the second migration, confirm that any
pre-existing non-null `milesight_device_id` values are unique.

## Hardware-dependent follow-up

Before configuring cloud device-information or readings paths, provide/verify
the applicable VS125 OpenAPI documentation, region, endpoint paths, response
examples, pagination/date query requirements, and authentication scope. Verify
whether the physical device can supply a stable event ID for the ingest
`Idempotency-Key`. Until then, cloud fetch operations without configured paths
fail explicitly; no fixture or mock is stored as live sensor data.

Service tests use mocked HTTP responses and fake database sessions only. Run
them from the repository root with:

```powershell
$env:PYTHONPATH = "backend"
backend\venv\Scripts\python.exe -m unittest discover -s backend\tests -v
```
