"""
midnight_reset.py
-----------------
Inserts a zero-count correction row at midnight (UTC) for every sensor line
that ended the previous day with a non-zero net occupancy.

How it works
------------
The VS125 sensor sends cumulative periodic counts.  Occupancy on the
dashboard is calculated as  SUM(in) - SUM(out)  across all readings
recorded_at on today's date (UTC).  If the last interval of the day had
more ins than outs the net carries forward into the next UTC day, making
the store appear occupied at midnight.

The fix: just before midnight rolls over (or just after, on the scheduler
tick) we check each (sensor_id, line) pair.  If net > 0 we insert one
synthetic reading with individuals_out = net and all other counts = 0,
timestamped at 23:59:59.999 of the closing day.  This brings the day's
net to exactly zero without touching any existing row.

Schedule
--------
The job fires once per day at 00:01 UTC so the closing day's readings are
complete.  It processes the *previous* calendar day, so even if the server
restarts at 00:00:05 the correction still lands correctly.
"""

import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import SensorLineReading

logger = logging.getLogger(__name__)

# Synthetic source_event_id prefix — makes corrections easy to identify
_RESET_PREFIX = "midnight-reset:"


async def run_midnight_reset(
    closing_date: date | None = None,
    triggered_by: str = "scheduler",
) -> dict:
    """
    Insert zero-occupancy correction rows for closing_date (defaults to
    yesterday UTC).  Returns a summary dict.

    triggered_by is stored in correction_reason so every synthetic row
    is self-documenting:
      - "scheduler"       automatic nightly job at 00:01 UTC
      - "manual:api"      POST /sensors/vs125/reset-occupancy endpoint
      - any other string  custom caller label
    """
    if closing_date is None:
        closing_date = date.today() - timedelta(days=1)

    day_start = datetime.combine(closing_date, time.min, tzinfo=timezone.utc)
    day_end   = datetime.combine(closing_date + timedelta(days=1), time.min, tzinfo=timezone.utc)
    # Correction is recorded at one millisecond before midnight
    correction_ts = day_end - timedelta(milliseconds=1)

    logger.info("Midnight reset: inspecting %s", closing_date)

    async with AsyncSessionLocal() as db:
        # Sum in/out per (sensor_id, line_uuid, line_id, line_name) for the day
        agg_rows = (await db.execute(
            select(
                SensorLineReading.sensor_id,
                SensorLineReading.line_id,
                SensorLineReading.line_name,
                SensorLineReading.line_uuid,
                func.sum(SensorLineReading.individuals_in).label("total_in"),
                func.sum(SensorLineReading.individuals_out).label("total_out"),
            )
            .where(
                SensorLineReading.recorded_at >= day_start,
                SensorLineReading.recorded_at <  day_end,
            )
            .group_by(
                SensorLineReading.sensor_id,
                SensorLineReading.line_id,
                SensorLineReading.line_name,
                SensorLineReading.line_uuid,
            )
        )).all()

        corrections = []
        skipped = 0

        for row in agg_rows:
            net = int(row.total_in or 0) - int(row.total_out or 0)

            if net <= 0:
                # Already balanced or negative — nothing to correct
                skipped += 1
                continue

            # Idempotency key: one reset per (sensor, line, day)
            source_event_id = (
                f"{_RESET_PREFIX}{row.sensor_id}|{row.line_uuid}|{closing_date.isoformat()}"
            )

            # Skip if a correction row already exists (re-entrant safety)
            existing = (await db.execute(
                select(SensorLineReading.id)
                .where(SensorLineReading.source_event_id == source_event_id)
                .limit(1)
            )).scalar_one_or_none()

            if existing is not None:
                logger.info(
                    "Midnight reset: correction already exists for sensor=%s line=%s date=%s — skipping",
                    row.sensor_id, row.line_uuid, closing_date,
                )
                skipped += 1
                continue

            correction = SensorLineReading(
                sensor_id=row.sensor_id,
                line_id=row.line_id,
                line_name=row.line_name,
                line_uuid=row.line_uuid,
                source_event_id=source_event_id,
                # Zero all counts except individuals_out which absorbs the imbalance
                individuals_in=0,
                individuals_out=net,
                male_in=0,
                male_out=0,
                female_in=0,
                female_out=0,
                group_in=0,
                group_out=0,
                children_in=0,
                children_out=0,
                period_start_at=day_start,
                recorded_at=correction_ts,
                received_at=datetime.now(timezone.utc),
                is_correction=True,
                correction_reason=f"midnight-reset triggered_by={triggered_by} net={net}",
            )
            corrections.append(correction)
            logger.info(
                "Midnight reset: sensor=%s line=%s net=%d → inserting correction row",
                row.sensor_id, row.line_uuid, net,
            )

        if corrections:
            db.add_all(corrections)
            try:
                await db.commit()
            except Exception:
                await db.rollback()
                logger.exception("Midnight reset: failed to commit correction rows")
                raise

    summary = {
        "closing_date": closing_date.isoformat(),
        "lines_inspected": len(agg_rows),
        "corrections_inserted": len(corrections),
        "lines_already_balanced": skipped,
    }
    logger.info("Midnight reset complete: %s", summary)
    return summary
