"""In-process metrics collection for API observability."""

from __future__ import annotations

from collections import Counter, defaultdict
from threading import Lock


class MetricsRegistry:
    """Minimal in-memory metrics registry."""

    def __init__(self) -> None:
        """Initialize the registry."""
        self._lock = Lock()
        self._request_total: Counter[tuple[str, str, int]] = Counter()
        self._request_duration_seconds: defaultdict[tuple[str, str], float] = defaultdict(float)

    def record_request(self, *, method: str, path: str, status_code: int, duration_seconds: float) -> None:
        """Record one completed HTTP request.

        Args:
            method: HTTP method.
            path: Route path template or raw path.
            status_code: HTTP status code.
            duration_seconds: Request duration in seconds.
        """
        with self._lock:
            self._request_total[method, path, status_code] += 1
            self._request_duration_seconds[method, path] += duration_seconds

    def render_prometheus(self) -> str:
        """Render metrics in a Prometheus-compatible text exposition format.

        Returns:
            str: Rendered metrics payload.
        """
        lines = [
            "# HELP brainstorm_agent_http_requests_total Total HTTP requests handled.",
            "# TYPE brainstorm_agent_http_requests_total counter",
        ]
        with self._lock:
            for (method, path, status_code), count in sorted(self._request_total.items()):
                lines.append(
                    "brainstorm_agent_http_requests_total"
                    f'{{method="{method}",path="{path}",status_code="{status_code}"}} {count}',
                )
            lines.extend(
                [
                    "# HELP brainstorm_agent_http_request_duration_seconds_total Total request duration.",
                    "# TYPE brainstorm_agent_http_request_duration_seconds_total counter",
                ],
            )
            for (method, path), duration in sorted(self._request_duration_seconds.items()):
                lines.append(
                    "brainstorm_agent_http_request_duration_seconds_total"
                    f'{{method="{method}",path="{path}"}} {duration:.6f}',
                )
        return "\n".join(lines) + "\n"
