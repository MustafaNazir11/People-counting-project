
from datetime import datetime

from sqlalchemy import (
    String,
    Integer,
    ForeignKey,
    DateTime,
    BigInteger, 
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


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


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True
    )
    store_id: Mapped[int] = mapped_column(
        ForeignKey("stores.id"), nullable=False
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
        default=lambda: datetime.now(),
        index=True,
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(),
    )

    __table_args__ = (
        Index("ix_vs125_sensor_recorded", "sensor_id", "recorded_at"),
    )
