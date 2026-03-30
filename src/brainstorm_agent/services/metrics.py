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
        self._auth_failures_total: Counter[str] = Counter()
        self._rate_limit_rejections_total: Counter[str] = Counter()

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
            lines.extend(
                [
                    "# HELP brainstorm_agent_auth_failures_total Total authentication failures.",
                    "# TYPE brainstorm_agent_auth_failures_total counter",
                ],
            )
            for reason, count in sorted(self._auth_failures_total.items()):
                lines.append(
                    f'brainstorm_agent_auth_failures_total{{reason="{reason}"}} {count}',
                )
            lines.extend(
                [
                    "# HELP brainstorm_agent_rate_limit_rejections_total Total rate-limit rejections.",
                    "# TYPE brainstorm_agent_rate_limit_rejections_total counter",
                ],
            )
            for reason, count in sorted(self._rate_limit_rejections_total.items()):
                lines.append(
                    f'brainstorm_agent_rate_limit_rejections_total{{reason="{reason}"}} {count}',
                )
        return "\n".join(lines) + "\n"

    def record_auth_failure(self, *, reason: str) -> None:
        """Record an authentication failure.

        Args:
            reason: Failure reason label.
        """
        with self._lock:
            self._auth_failures_total[reason] += 1

    def record_rate_limit_rejection(self, *, reason: str) -> None:
        """Record a rate-limit rejection.

        Args:
            reason: Rejection reason label.
        """
        with self._lock:
            self._rate_limit_rejections_total[reason] += 1
