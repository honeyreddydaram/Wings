"""Privacy-safe structured logging and HTTP request instrumentation."""

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone

from fastapi import FastAPI, Request

from .config import Settings


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }
        for key in ("request_id", "method", "route", "status_code", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info:
            payload["exception_type"] = record.exc_info[0].__name__
        return json.dumps(payload, separators=(",", ":"))


def configure_logging(settings: Settings) -> logging.Logger:
    handler = logging.StreamHandler()
    if settings.log_format == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level)
    return logging.getLogger("cowingman")


def _request_id(value: str | None) -> str:
    if value and len(value) <= 128 and re.fullmatch(r"[A-Za-z0-9._-]+", value):
        return value
    return str(uuid.uuid4())


def install_request_logging(app: FastAPI, logger: logging.Logger) -> None:
    @app.middleware("http")
    async def request_observability(request: Request, call_next):
        request_id = _request_id(request.headers.get("x-request-id"))
        request.state.request_id = request_id
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            route = request.scope.get("route")
            logger.exception(
                "request_failed",
                extra={"request_id": request_id, "method": request.method, "route": route.path if route else "<unmatched>"},
            )
            raise
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        route = request.scope.get("route")
        logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "route": route.path if route else "<unmatched>",
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response
