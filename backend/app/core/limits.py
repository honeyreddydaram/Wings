"""Best-effort in-process safeguards; Cloud Armor remains the distributed edge."""

from collections import defaultdict
import threading
import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .config import Settings


class FixedWindowLimiter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[int, int]] = defaultdict(lambda: (0, 0))

    def allow(self, key: str, limit: int, now: float | None = None) -> bool:
        minute = int((time.time() if now is None else now) // 60)
        with self._lock:
            old_minute, count = self._windows.get(key, (0, 0))
            count = count + 1 if old_minute == minute else 1
            self._windows[key] = (minute, count)
            if len(self._windows) > 10_000:
                self._windows = {k: v for k, v in self._windows.items() if v[0] >= minute - 1}
            return count <= limit

    def reset(self) -> None:
        with self._lock:
            self._windows.clear()


edge_limiter = FixedWindowLimiter()
provider_limiter = FixedWindowLimiter()


class BudgetExceeded(RuntimeError):
    pass


def install_edge_limits(app: FastAPI, settings: Settings) -> None:
    @app.middleware("http")
    async def edge_limit(request: Request, call_next):
        if request.url.path in {"/healthz", "/readyz"}:
            return await call_next(request)
        address = request.client.host if request.client else "unknown"
        if not edge_limiter.allow(address, settings.edge_rate_limit_per_minute):
            return JSONResponse(
                {"detail": "Request limit reached. Try again shortly."},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        return await call_next(request)


def claim_provider_budget(settings: Settings) -> None:
    if not provider_limiter.allow("provider", settings.provider_budget_per_minute):
        raise BudgetExceeded("Provider request budget reached")
