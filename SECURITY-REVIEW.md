# Security Review Summary

## Status

This was a source-only, incomplete security audit. No target-controlled tests,
builds, or processes were run because the required OS-enforced sandbox was not
available. The review did not establish that the codebase is free of
vulnerabilities.

- Reviewed revision: `1c447b080cfc7f2e92386c03b4ca3db5bfa0b9da`
- Worktree: dirty; the current source included modified and untracked files.
- Prior coverage ledger: none found.
- `backend/.env` contents were not inspected.

This report is a snapshot of the reviewed revision above. The current working
tree now contains remediation changes for per-sensor ingest identity and
database-enforced event-key deduplication. Those changes and their tests have
not been runtime-validated in an OS-enforced sandbox; the historical finding
below describes the earlier revision, not a confirmed issue in the current
working tree.

## Needs validation

### Sensor-ingest credentials may permit writing readings for any sensor

**Status:** Needs validation; not a confirmed vulnerability. No severity is
assigned.

The VS125 ingest route is mounted at `/sensors/vs125`
([`backend/app/main.py`](backend/app/main.py#L30)). The handler accepts a
`sensor_id`, checks that the sensor exists, and passes the supplied identifier
to the reading write operation after validating a configured token
([`backend/app/routers/vs125.py`](backend/app/routers/vs125.py#L27-L50)).
The integration guide describes `SENSOR_INGEST_TOKEN` as authenticating ingest
requests ([`backend/VS125_INTEGRATION.md`](backend/VS125_INTEGRATION.md#L38-L40)).
The source does not bind that token to a specific sensor.

If independent, lower-trust devices share this credential, a holder could
submit fabricated readings under another sensor's ID and affect its data and
analytics. Repository source does not establish how the token is provisioned
or whether only one trusted collector holds it; that trust-boundary fact needs
owner validation.

**Smallest effective fix if credentials are shared across independent
devices:** Bind each credential to an authorized sensor and derive or verify
the sensor identity from that binding instead of trusting the request's
`sensor_id`.

**Safe validation plan:** Have the system owner verify credential provisioning
and intended sender authority. If independent devices share the token, validate
the authorization boundary using dummy sensors and a dummy credential in an
OS-enforced sandbox.

## Validation blocker

The available environment did not demonstrate all required sandbox controls:
external-network denial, an empty allowlisted environment, read-only target and
toolchain, scratch-only writes, and explicit resource limits. To complete
validation, run the existing tests with dummy credentials and isolated
database fixtures in such a sandbox, including a two-sensor ingest
authorization check.
