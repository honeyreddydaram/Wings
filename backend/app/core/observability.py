"""Low-cardinality, privacy-safe OpenTelemetry primitives.

Only enumerated attribute names are accepted. Callers cannot attach user text,
identifiers, URLs, prompts, audio, profile fields, or provider responses.
"""

from contextlib import contextmanager
from dataclasses import dataclass
import threading
import time
from typing import Iterator

from opentelemetry import metrics, trace
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

from .config import Settings


SAFE_ATTRIBUTE_KEYS = frozenset({
    "component", "operation", "outcome", "provider", "model", "http.method",
    "http.route", "http.status_code", "audio.format", "audio.size_bucket",
    "signal", "mode", "fallback", "duplicate",
})
SAFE_ENUM_KEYS = frozenset({
    "component", "operation", "outcome", "provider", "audio.format",
    "audio.size_bucket", "signal", "mode",
})
SAFE_VALUE = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:/{}-")


def safe_attributes(values: dict[str, object]) -> dict[str, str | int | float | bool]:
    """Return validated telemetry attributes or fail closed.

    Enumerated text is deliberately short. Route templates may contain braces and
    model identifiers may contain a slash; no arbitrary application text belongs here.
    """
    result: dict[str, str | int | float | bool] = {}
    for key, value in values.items():
        if key not in SAFE_ATTRIBUTE_KEYS:
            raise ValueError(f"Unsafe telemetry attribute: {key}")
        if not isinstance(value, (str, int, float, bool)):
            raise ValueError(f"Unsafe telemetry value type: {key}")
        if isinstance(value, str):
            if len(value) > 96 or not value or any(char not in SAFE_VALUE for char in value):
                raise ValueError(f"Unsafe telemetry value: {key}")
            if key in SAFE_ENUM_KEYS and len(value) > 40:
                raise ValueError(f"Telemetry enum too long: {key}")
        result[key] = value
    return result


@dataclass
class Instruments:
    requests: object
    duration: object
    failures: object


_lock = threading.Lock()
_configured = False
_instruments: Instruments | None = None


def configure_telemetry(settings: Settings) -> None:
    global _configured, _instruments
    with _lock:
        if _configured:
            return
        resource = Resource.create({"service.name": settings.otel_service_name})
        if settings.otel_enabled:
            tracer_provider = TracerProvider(
                resource=resource,
                sampler=ParentBased(TraceIdRatioBased(settings.otel_sample_ratio)),
            )
            tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
            trace.set_tracer_provider(tracer_provider)
            reader = PeriodicExportingMetricReader(OTLPMetricExporter())
            metrics.set_meter_provider(MeterProvider(resource=resource, metric_readers=[reader]))
        meter = metrics.get_meter("cowingman")
        _instruments = Instruments(
            requests=meter.create_counter("cowingman.operations", unit="1"),
            duration=meter.create_histogram("cowingman.operation.duration", unit="ms"),
            failures=meter.create_counter("cowingman.operation.failures", unit="1"),
        )
        _configured = True


@contextmanager
def observe(name: str, **attributes: object) -> Iterator[trace.Span]:
    attrs = safe_attributes(attributes)
    tracer = trace.get_tracer("cowingman")
    started = time.perf_counter()
    with tracer.start_as_current_span(
        name, attributes=attrs, record_exception=False, set_status_on_exception=False
    ) as span:
        try:
            yield span
        except Exception:
            # Exception messages and stack frames can contain application data.
            # Operational logs record only the exception class separately.
            span.set_status(trace.Status(trace.StatusCode.ERROR))
            if _instruments:
                _instruments.failures.add(1, attrs)
            raise
        finally:
            if _instruments:
                _instruments.requests.add(1, attrs)
                _instruments.duration.record((time.perf_counter() - started) * 1000, attrs)
