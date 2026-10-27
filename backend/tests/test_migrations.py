from pathlib import Path
import unittest


MIGRATION_DIR = Path(__file__).resolve().parents[1] / "migrations"


class MigrationTests(unittest.TestCase):
    def test_idempotency_migration_checks_existing_data_before_constraint(self):
        migration = (
            MIGRATION_DIR / "0001_sensor_reading_idempotency.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("btrim(source_event_id) = ''", migration)
        self.assertIn("HAVING COUNT(*) > 1", migration)
        self.assertIn(
            "UNIQUE (sensor_id, source_event_id, line_uuid)",
            migration,
        )

    def test_credential_migration_binds_hashes_to_sensor_rows(self):
        migration = (
            MIGRATION_DIR / "0003_sensor_ingest_credentials.sql"
        ).read_text(encoding="utf-8")

        self.assertIn("sensor_ingest_credentials", migration)
        self.assertIn("REFERENCES sensors(id) ON DELETE CASCADE", migration)
        self.assertIn(
            "uq_sensor_ingest_credential_token_hash",
            migration,
        )
        self.assertIn("revoked_at TIMESTAMPTZ NULL", migration)


if __name__ == "__main__":
    unittest.main()
