"""Environment-driven configuration for the backend.

Every value is read once at import time from an environment variable, with a
default chosen so a fresh clone runs without a ``.env`` file. Anything a
deployment might need to change (CORS origins, log level, stream cadence) is
here rather than inlined at its point of use.
"""

import logging
import os

API_VERSION = "2.1.0"

# Allowed CORS origins come from the ALLOWED_ORIGINS env var (comma-separated).
# Falls back to the local dev servers when the var is unset so local dev "just
# works". Set ALLOWED_ORIGINS in production, e.g.:
#   ALLOWED_ORIGINS=https://ethereal-hotel-pink.vercel.app
_DEFAULT_ORIGINS = (
    "http://localhost:4200,"  # Angular dev server
    "http://localhost:5173,"  # Vite alternative
    "http://127.0.0.1:4200,"
    "http://127.0.0.1:5173"
)
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

# How often the shared broadcaster computes one snapshot and fans it out to
# every connected client. Floored so a bad value can't spin the event loop.
BROADCAST_INTERVAL_SECONDS = max(
    0.1, float(os.getenv("BROADCAST_INTERVAL_SECONDS", "2"))
)

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

_LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"


def configure_logging() -> None:
    """Install a root log handler at ``LOG_LEVEL``.

    An unrecognised level falls back to INFO with a warning rather than raising:
    a typo'd env var on a deploy platform should degrade the logs, not take the
    service down on startup.
    """
    level = logging.getLevelName(LOG_LEVEL)
    unknown_level = not isinstance(level, int)
    if unknown_level:
        level = logging.INFO

    logging.basicConfig(level=level, format=_LOG_FORMAT)

    if unknown_level:
        logging.getLogger(__name__).warning(
            "Unknown LOG_LEVEL %r, falling back to INFO", LOG_LEVEL
        )
