"""CHG-102 phase 5a: the plant time zone the CPLM Long / Fusion jobs stamp boundary evidence with."""
from __future__ import annotations

import os
from pathlib import Path


def resolve_plant_time_zone(spec: str | None = None) -> str:
    """CHG-102 5a: the plant zone for boundary evidence (local 00:00 / 12:00). PLANT_TIME_ZONE (default
    ``local``); ``local`` resolves on THIS host to a concrete id: TZ env, /etc/timezone, the
    /etc/localtime symlink, else UTC. The job maps IR / Asia/Tehran to a fixed +03:30 itself."""
    tz = (spec if spec is not None else os.getenv("PLANT_TIME_ZONE", "local")).strip() or "local"
    if tz.lower() != "local":
        return tz
    env_tz = os.getenv("TZ", "").strip().lstrip(":")
    if env_tz and not env_tz.startswith("/"):
        return env_tz
    try:
        etc = Path("/etc/timezone").read_text(encoding="utf-8").strip()
        if etc:
            return etc
    except OSError:
        pass
    try:
        target = os.readlink("/etc/localtime")
        if "zoneinfo/" in target:
            return target.split("zoneinfo/", 1)[1]
    except OSError:
        pass
    return "UTC"
