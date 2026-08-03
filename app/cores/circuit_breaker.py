"""
Simple in-process circuit breaker.

Usage
-----
    cb = CircuitBreaker(name="gemini", failure_threshold=3, reset_timeout=60)

    @cb.call
    def my_request():
        ...

Or inline:
    result = cb.call(my_function, arg1, arg2)

States
------
  CLOSED   → normal operation; failure counter incremented on exception.
  OPEN     → short-circuits immediately with CircuitOpenError;
             re-enters HALF_OPEN after `reset_timeout` seconds.
  HALF_OPEN → one probe request is allowed; success → CLOSED, failure → OPEN.
"""

import logging
import time
import threading
from functools import wraps

logger = logging.getLogger(__name__)


class CircuitOpenError(Exception):
    """Raised when a call is rejected because the circuit breaker is OPEN."""


class CircuitBreaker:
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        reset_timeout: float = 60.0,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout

        self._state = self.CLOSED
        self._failure_count = 0
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    @property
    def state(self) -> str:
        with self._lock:
            if self._state == self.OPEN:
                assert self._opened_at is not None
                if time.monotonic() - self._opened_at >= self.reset_timeout:
                    self._state = self.HALF_OPEN
                    logger.info("Circuit breaker '%s' → HALF_OPEN", self.name)
            return self._state

    def _record_success(self) -> None:
        with self._lock:
            self._failure_count = 0
            if self._state != self.CLOSED:
                logger.info("Circuit breaker '%s' → CLOSED", self.name)
            self._state = self.CLOSED
            self._opened_at = None

    def _record_failure(self) -> None:
        with self._lock:
            self._failure_count += 1
            logger.warning(
                "Circuit breaker '%s' failure %d/%d",
                self.name,
                self._failure_count,
                self.failure_threshold,
            )
            if self._failure_count >= self.failure_threshold:
                self._state = self.OPEN
                self._opened_at = time.monotonic()
                logger.error(
                    "Circuit breaker '%s' → OPEN (will retry in %ss)",
                    self.name,
                    self.reset_timeout,
                )

    def call(self, func, *args, **kwargs):
        current_state = self.state
        if current_state == self.OPEN:
            raise CircuitOpenError(
                f"Circuit breaker '{self.name}' is OPEN — rejecting call to avoid cascading failures"
            )
        try:
            result = func(*args, **kwargs)
            self._record_success()
            return result
        except CircuitOpenError:
            raise
        except Exception:
            self._record_failure()
            raise

    def __call__(self, func):
        """Allow use as a decorator: @cb"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            return self.call(func, *args, **kwargs)
        return wrapper
