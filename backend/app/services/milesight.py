import os
from dataclasses import dataclass
import math
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlsplit

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DEVICE_CONFIG_PATH = "/device/openapi/v1/devices/{device_id}/config"


class MilesightConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class MilesightSettings:
    base_url: str
    access_token: str
    default_device_id: str | None
    device_info_path: str | None
    device_config_path: str
    readings_path: str | None
    timeout_seconds: float = 30

    @classmethod
    def from_env(cls) -> "MilesightSettings":
        base_url = os.getenv("MILESIGHT_BASE_URL", "").strip().rstrip("/")
        token = os.getenv("MILESIGHT_ACCESS_TOKEN", "").strip()
        if not base_url:
            raise MilesightConfigurationError(
                "MILESIGHT_BASE_URL must be configured."
            )
        if not token:
            raise MilesightConfigurationError(
                "MILESIGHT_ACCESS_TOKEN must be configured."
            )
        parsed_url = urlsplit(base_url)
        if parsed_url.scheme != "https" or not parsed_url.netloc:
            raise MilesightConfigurationError(
                "MILESIGHT_BASE_URL must be an absolute HTTPS URL."
            )

        try:
            timeout = float(os.getenv("MILESIGHT_TIMEOUT_SECONDS", "30"))
        except ValueError as exc:
            raise MilesightConfigurationError(
                "MILESIGHT_TIMEOUT_SECONDS must be a number."
            ) from exc
        if not math.isfinite(timeout) or timeout <= 0:
            raise MilesightConfigurationError(
                "MILESIGHT_TIMEOUT_SECONDS must be greater than zero."
            )

        return cls(
            base_url=base_url,
            access_token=token,
            default_device_id=(
                os.getenv("MILESIGHT_DEVICE_ID", "").strip() or None
            ),
            device_info_path=(
                os.getenv("MILESIGHT_DEVICE_INFO_PATH", "").strip() or None
            ),
            device_config_path=(
                os.getenv("MILESIGHT_DEVICE_CONFIG_PATH", "").strip()
                or DEVICE_CONFIG_PATH
            ),
            readings_path=(
                os.getenv("MILESIGHT_READINGS_PATH", "").strip() or None
            ),
            timeout_seconds=timeout,
        )


class MilesightClient:
    """Configurable async client; endpoint paths follow the vendor contract."""

    def __init__(
        self,
        settings: MilesightSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
    ):
        self.settings = settings
        self.http_client = http_client

    async def _get(
        self,
        path_template: str | None,
        *,
        device_id: str | None = None,
        params: dict[str, str | int | float] | None = None,
    ) -> dict[str, Any]:
        if not path_template:
            raise MilesightConfigurationError(
                "The requested Milesight endpoint path is not configured."
            )

        resolved_device_id = device_id or self.settings.default_device_id
        if "{device_id}" in path_template and not resolved_device_id:
            raise MilesightConfigurationError(
                "MILESIGHT_DEVICE_ID or a device ID is required."
            )
        try:
            path = path_template.format(
                device_id=quote(resolved_device_id or "", safe="")
            )
        except (KeyError, ValueError) as exc:
            raise MilesightConfigurationError(
                "The configured Milesight endpoint path template is invalid."
            ) from exc
        url = f"{self.settings.base_url}/{path.lstrip('/')}"
        headers = {
            "Authorization": f"Bearer {self.settings.access_token}",
            "Accept": "application/json",
        }

        if self.http_client is None:
            async with httpx.AsyncClient(
                timeout=self.settings.timeout_seconds
            ) as client:
                response = await client.get(
                    url,
                    headers=headers,
                    params=params,
                )
        else:
            response = await self.http_client.get(
                url,
                headers=headers,
                params=params,
            )
        response.raise_for_status()

        try:
            payload = response.json()
        except ValueError as exc:
            raise ValueError(
                "Milesight returned invalid JSON."
            ) from exc
        if not isinstance(payload, dict):
            raise ValueError("Milesight returned an unexpected response.")
        return payload

    async def get_device_information(
        self,
        device_id: str | None = None,
        *,
        params: dict[str, str | int | float] | None = None,
    ) -> dict[str, Any]:
        return await self._get(
            self.settings.device_info_path,
            device_id=device_id,
            params=params,
        )

    async def get_device_configuration(
        self,
        device_id: str | None = None,
        *,
        params: dict[str, str | int | float] | None = None,
    ) -> dict[str, Any]:
        return await self._get(
            self.settings.device_config_path,
            device_id=device_id,
            params=params,
        )

    async def get_line_readings(
        self,
        device_id: str | None = None,
        *,
        params: dict[str, str | int | float] | None = None,
    ) -> dict[str, Any]:
        return await self._get(
            self.settings.readings_path,
            device_id=device_id,
            params=params,
        )


def get_client() -> MilesightClient:
    return MilesightClient(MilesightSettings.from_env())


async def get_milesight_data(endpoint: str) -> dict[str, Any]:
    """Compatibility wrapper for the previously exposed config helper."""
    settings = MilesightSettings.from_env()
    return await MilesightClient(settings)._get(
        f"/device/openapi/v1/devices/{{device_id}}/{endpoint}"
    )


async def get_device_config() -> dict[str, Any]:
    return await get_client().get_device_configuration()


def normalize_milesight_config(response: dict[str, Any]) -> dict[str, Any]:
    if response.get("status") != "Success":
        raise ValueError("Milesight configuration request failed")

    data = response.get("data")
    if not isinstance(data, dict):
        raise ValueError("Milesight configuration data is missing.")

    values = data.get("values")
    if not isinstance(values, list):
        raise ValueError("Milesight configuration values are missing.")

    sensitive_terms = (
        "password",
        "passwd",
        "passphrase",
        "secret",
        "token",
        "credential",
        "private",
        "psk",
        "key",
    )

    def is_sensitive(key: str) -> bool:
        normalized_key = key.casefold()
        return any(term in normalized_key for term in sensitive_terms)

    def safe_value(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: safe_value(nested_value)
                for key, nested_value in value.items()
                if isinstance(key, str) and not is_sensitive(key)
            }
        if isinstance(value, list):
            return [safe_value(item) for item in value]
        return value

    configuration: dict[str, Any] = {}
    for item in values:
        if not isinstance(item, dict) or not isinstance(item.get("key"), str):
            continue

        key = item["key"]
        if not is_sensitive(key):
            configuration[key] = safe_value(item.get("value"))

    return configuration
