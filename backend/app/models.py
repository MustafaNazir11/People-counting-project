
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    String,
    Integer,
    ForeignKey,
    DateTime,
    BigInteger, 
    Index,
    JSON,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base

class PlatformAdmin(Base):
    __tablename__ = "platform_admins"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )



class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(
        String, nullable=False
    )
    role: Mapped[str] = mapped_column(
        String(50), default="store_user"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )


class Store(Base):
    __tablename__ = "stores"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    organization_id: Mapped[int] = mapped_column(
        ForeignKey("organizations.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    location: Mapped[str | None] = mapped_column(
        String(500), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id"), nullable=False
    )
    device_id: Mapped[str] = mapped_column(
        String(100), nullable=False
    )
    name: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(50), default="offline"
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.now
    )
    milesight_device_id: Mapped[str | None] = mapped_column(
    String(100), unique=True, nullable=True
    )
    serial_number: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    model: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    firmware_version: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    ip_address: Mapped[str | None] = mapped_column(
        String(45), nullable=True
    )
    last_seen_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    config_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    is_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="true",
    )


class UserStoreAccess(Base):
    __tablename__ = "user_store_access"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"),
        primary_key=True,
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id"),
        primary_key=True,
    )


class SensorIngestCredential(Base):
    __tablename__ = "sensor_ingest_credentials"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    sensor_id: Mapped[int] = mapped_column(
        ForeignKey("sensors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        UniqueConstraint(
            "token_hash",
            name="uq_sensor_ingest_credential_token_hash",
        ),
    )


class SensorLineReading(Base):
    __tablename__ = "sensor_line_readings"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    sensor_id: Mapped[int] = mapped_column(
        ForeignKey("sensors.id"), nullable=False, index=True
    )
    line_id: Mapped[int] = mapped_column(Integer, nullable=False)
    line_name: Mapped[str] = mapped_column(String(255), nullable=False)
    line_uuid: Mapped[str] = mapped_column(String(100), nullable=False)
    source_event_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )

    individuals_in: Mapped[int] = mapped_column(Integer, nullable=False)
    individuals_out: Mapped[int] = mapped_column(Integer, nullable=False)
    male_in: Mapped[int] = mapped_column(Integer, nullable=False)
    male_out: Mapped[int] = mapped_column(Integer, nullable=False)
    female_in: Mapped[int] = mapped_column(Integer, nullable=False)
    female_out: Mapped[int] = mapped_column(Integer, nullable=False)
    group_in: Mapped[int] = mapped_column(Integer, nullable=False)
    group_out: Mapped[int] = mapped_column(Integer, nullable=False)

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_vs125_sensor_recorded", "sensor_id", "recorded_at"),
        UniqueConstraint(
            "sensor_id",
            "source_event_id",
            "line_uuid",
            name="uq_sensor_reading_source_event_line",
        ),
    )


class SensorDeviceInfo(Base):
    __tablename__ = "sensor_device_info"

    id = Column(Integer, primary_key=True, index=True)
    sensor_id = Column(
        Integer,
        ForeignKey("sensors.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )

    # Device configuration
    device_sn = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    device_mac = Column(String, nullable=True)
    device_wlan_mac = Column(String, nullable=True)
    firmware_version = Column(String, nullable=True)
    hardware_version = Column(String, nullable=True)
    tsl_version = Column(String, nullable=True)
    cus_site_id = Column(String, nullable=True)
    cus_device_id = Column(String, nullable=True)

    # Latest device state
    running_time = Column(Integer, nullable=True)
    cpu = Column(JSON, nullable=True)
    ram = Column(JSON, nullable=True)
    storage = Column(JSON, nullable=True)
    device_tilt_pitch_roll = Column(JSON, nullable=True)

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SensorConfiguration(Base):
    __tablename__ = "sensor_configurations"

    id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True
    )
    sensor_id: Mapped[int] = mapped_column(
        ForeignKey("sensors.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    configuration: Mapped[dict] = mapped_column(
        JSONB, nullable=False
    )
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


